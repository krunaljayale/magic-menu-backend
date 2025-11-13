// routes/phonepeWebhook.js
const express = require("express");
const mongoose = require("mongoose");
const LiveOrder = require("../models/liveOrder");
const DraftOrder = require("../models/draftOrder");
const PaymentLog = require("../models/paymentLog");
const { logError } = require("../utils/logger");
const { sendPushNotification } = require("../utils/notificationHelper");
const Customer = require("../models/customer");
const router = express.Router();

// Use JSON parser (we rely on BasicAuth, no X-VERIFY)
router.post("/webhook/phonepe", express.json(), async (req, res) => {
    console.log("Request received");
  // constant-time compare for creds
  const crypto = require("crypto");
  const safeCompare = (a, b) => {
    try {
      const bufA = Buffer.from(String(a), "utf8");
      const bufB = Buffer.from(String(b), "utf8");
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  };

  const verifyBasicAuth = (req) => {
    const header = req.headers["authorization"] || req.headers["Authorization"];
    if (!header || !header.startsWith("Basic ")) return false;
    const b64 = header.slice(6).trim();
    let decoded;
    try {
      decoded = Buffer.from(b64, "base64").toString("utf8"); // "user:pass"
    } catch {
      return false;
    }
    const parts = decoded.split(":");
    const user = parts.shift() || "";
    const pass = parts.join(":") || "";
    const expectedUser = String(process.env.PHONEPE_CB_USER || "").trim();
    const expectedPass = String(process.env.PHONEPE_CB_PASS || "").trim();
    return safeCompare(user, expectedUser) && safeCompare(pass, expectedPass);
  };

  // map gateway state -> your PaymentLog.status
  const mapPhonepeStateToInternal = (phonepeState) => {
    if (!phonepeState) return "PENDING";
    const s = String(phonepeState).toUpperCase();
    switch (s) {
      case "COMPLETED":
      case "SUCCESS":
        return "SUCCESS";
      case "FAILED":
      case "ERROR":
      case "CANCELLED":
      case "ABORTED":
        return "FAILURE";
      default:
        return "PENDING";
    }
  };

  try {
    // 1) Verify Basic Auth
    if (!verifyBasicAuth(req)) {
      logError("PhonePe webhook - BasicAuth failed", { headers: req.headers });
      return res.status(401).send("Unauthorized");
    }

    // 2) Read event and payload per PhonePe guidance
    const body = req.body || {};
    const event = String(body.event || "").trim();
    const payload = body.payload || {};

    // We only process checkout.order.completed
    if (event !== "checkout.order.completed") {
      return res.status(200).send("Ignored event");
    }

    // Use payload.state as source of truth
    const gatewayState = String(payload.state || "").toUpperCase();
    const mappedStatus = mapPhonepeStateToInternal(gatewayState);

    // Extract merchantOrderId (merchantOrderId is preferred for matching)
    const merchantOrderId = payload.merchantOrderId || null;
    const phonepeOrderId = payload.orderId || null;
    if (!merchantOrderId || !phonepeOrderId) {
      logError("PhonePe webhook missing merchantOrderId", { payload });
      return res.status(400).send("Missing identifiers");
    }

    // 3) Find PaymentLog
    const payment = await PaymentLog.findOne({
      $or: [
        { merchantUserId: merchantOrderId },
        { phonepeOrderId: phonepeOrderId },
      ],
    });

    if (!payment) {
      logError("PhonePe webhook - PaymentLog not found", {
        merchantOrderId,
        payload,
      });
      return res.status(404).send("Transaction not found");
    }

    // 4) Idempotency: if already terminal and phonepeState matches, nothing to do
    if (
      (payment.status === "SUCCESS" || payment.status === "FAILURE") &&
      payment.phonepeState === gatewayState
    ) {
      return res.status(200).send("OK");
    }

    // 5) If not SUCCESS, update PaymentLog and return 200 (no order creation)
    if (mappedStatus !== "SUCCESS") {
      payment.status = mappedStatus === "FAILURE" ? "FAILURE" : payment.status;
      payment.phonepeState = gatewayState;
      await payment.save();
      return res.status(200).send("OK");
    }

    // 6) SUCCESS -> atomically promote DraftOrder -> LiveOrder
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Idempotency: check existing LiveOrder
      const existingLive = await LiveOrder.findOne({
        payment: payment._id,
      }).session(session);
      if (existingLive) {
        payment.status = "SUCCESS";
        payment.phonepeState = gatewayState;
        await payment.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).send("OK");
      }

      // Claim DraftOrder atomically
      const claimedDraft = await DraftOrder.findOneAndUpdate(
        { payment: payment._id, status: "AWAITING_PAYMENT" },
        { $set: { status: "CREATING_ORDER" } },
        { session, returnDocument: "after" }
      );

      if (!claimedDraft) {
        // Maybe already converted -> double-check and return
        const maybe = await DraftOrder.findOne({
          payment: payment._id,
        }).session(session);
        if (maybe && maybe.status === "CREATED") {
          payment.status = "SUCCESS";
          payment.phonepeState = gatewayState;
          await payment.save({ session });
          await session.commitTransaction();
          session.endSession();
          return res.status(200).send("OK");
        }
        await session.commitTransaction();
        session.endSession();
        logError("PhonePe webhook - DraftOrder not claimable", {
          paymentId: payment._id,
        });
        return res.status(200).send("OK");
      }

      // Optionally log amount mismatch (payload.amount is epoch paise)
      if (
        typeof payload.amount !== "undefined" &&
        payment.amountInPaise &&
        Number(payload.amount) !== Number(payment.amountInPaise)
      ) {
        logError("PhonePe webhook - amount mismatch", {
          paymentId: payment._id,
          payloadAmount: payload.amount,
          expected: payment.amountInPaise,
        });
      }

      // Build LiveOrder using only fields present in LiveOrder schema
      const liveOrderData = {
        ticketNumber: claimedDraft.ticketNumber,
        orderOtp: claimedDraft.orderOtp,
        status: "PENDING",
        customer: claimedDraft.customer,
        hotel: claimedDraft.hotel,
        payment: payment._id,
        locationIndex: claimedDraft.locationIndex,
        items: claimedDraft.items.map((it) => ({
          item: it.item,
          quantity: it.quantity,
        })),
        totalPrice: claimedDraft.totalPrice,
      };

      // Create LiveOrder
      const [createdLiveOrder] = await LiveOrder.create([liveOrderData], {
        session,
      });

      // Finalize DraftOrder and PaymentLog
      claimedDraft.status = "CREATED";
      await claimedDraft.save({ session });

      payment.status = "SUCCESS";
      payment.phonepeState = gatewayState;
      await payment.save({ session });

      await session.commitTransaction();
      session.endSession();

      // After commit: enqueue notifications/fulfillment (outside txn)
      const customer = await Customer.findById(payment.customer)
      await sendPushNotification(customer.fcmToken, {
        title: "Order Confirmed: Preparation Starts 👨‍🍳",
        body: "Your grub is being prepared! We'll notify you once our delivery partner picks it up. 🏍️",
        image:"https://res.cloudinary.com/dcgskimn8/image/upload/v1751294918/Delivery_Boy_1_tf3ynj.jpg",
        android: {
          channelId: "custom-sound-channel",
          sound: "magicmenu_zing_enhanced",
        },
      });

      return res.status(200).send("OK");
    } catch (txnErr) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (e) {
        logError("PhonePe webhook - abort failed", e);
      }
      logError("PhonePe webhook - transaction error", txnErr);
      return res.status(500).send("Server error");
    }
  } catch (err) {
    logError("PhonePe webhook - unhandled error", err);
    return res.status(500).send("Server error");
  }
});

module.exports = router;
