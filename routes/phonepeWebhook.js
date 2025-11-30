// routes/phonepeWebhook.js
const express = require("express");
const mongoose = require("mongoose");
const PaymentLog = require("../models/paymentLog");
const DraftOrder = require("../models/draftOrder");
const LiveOrder = require("../models/liveOrder");
const Customer = require("../models/customer");
const Owner = require("../models/owner");

const { verifyPhonePeWebhookAuth } = require("../utils/phonepeAuth");
const { logError } = require("../utils/logger");
const { sendPushNotification } = require("../utils/notificationHelper");

const router = express.Router();

router.post("/webhook/phonepe", express.json(), async (req, res) => {
  // console.log("PhonePe Webhook: request received");

  // 1️⃣ AUTHENTICATION
  if (!verifyPhonePeWebhookAuth(req)) {
    logError("PhonePe Webhook: Authorization failed", {
      auth: req.headers.authorization,
    });
    return res.status(401).send("Unauthorized");
  }

  const body = req.body || {};
  const event = String(body.event || "").trim();
  const payload = body.payload || {};

  // 2️⃣ PROCESS ONLY THE VALID EVENTS
  if (!["checkout.order.completed", "checkout.order.failed"].includes(event)) {
    return res.status(200).send("Ignored event");
  }

  try {
    const gatewayState = String(payload.state || "").toUpperCase();
    const merchantOrderId = payload.merchantOrderId;
    const phonepeOrderId = payload.orderId;

    if (!merchantOrderId) {
      logError("PhonePe Webhook: missing merchantOrderId", payload);
      return res.status(400).send("Missing merchantOrderId");
    }

    let internalStatus = "PENDING";
    if (gatewayState === "COMPLETED" || gatewayState === "SUCCESS")
      internalStatus = "SUCCESS";
    else if (gatewayState === "FAILED") internalStatus = "FAILURE";

    // 3️⃣ FIND PAYMENTLOG
    const payment = await PaymentLog.findOne({
      $or: [
        { merchantUserId: merchantOrderId },
        { phonepeOrderId: phonepeOrderId },
      ],
    });

    if (!payment) {
      logError("PhonePe Webhook: PaymentLog not found", {
        merchantOrderId,
        phonepeOrderId,
      });
      return res.status(200).send("OK");
    }

    // If already terminal and same state → idempotent
    if (
      ["SUCCESS", "FAILURE"].includes(payment.status) &&
      payment.phonepeState === gatewayState
    ) {
      return res.status(200).send("OK");
    }

    // 4️⃣ PAYMENT FAILURE
    if (internalStatus === "FAILURE") {
      payment.status = "FAILURE";
      payment.phonepeState = gatewayState;
      await payment.save();
      return res.status(200).send("OK");
    }

    // 5️⃣ PAYMENT SUCCESS — CREATE LIVE ORDER
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Check if LiveOrder already created
      const existing = await LiveOrder.findOne({
        payment: payment._id,
      }).session(session);
      if (existing) {
        payment.status = "SUCCESS";
        payment.phonepeState = gatewayState;
        await payment.save({ session });

        await session.commitTransaction();
        session.endSession();
        return res.status(200).send("OK");
      }

      // Claim DraftOrder
      const draft = await DraftOrder.findOneAndUpdate(
        { payment: payment._id, status: "AWAITING_PAYMENT" },
        { status: "CREATING_ORDER" },
        { session, new: true }
      );

      if (!draft) {
        await session.commitTransaction();
        session.endSession();
        return res.status(200).send("OK");
      }

      // Create LiveOrder
      const [liveOrder] = await LiveOrder.create(
        [
          {
            ticketNumber: draft.ticketNumber,
            orderOtp: draft.orderOtp,
            status: "PENDING",
            customer: draft.customer,
            hotel: draft.hotel,
            payment: payment._id,
            locationIndex: draft.locationIndex,
            items: draft.items,
            totalPrice: draft.totalPrice,
            remarks: draft.remarks,
          },
        ],
        { session }
      );

      draft.status = "CREATED";
      await draft.save({ session });

      payment.status = "SUCCESS";
      payment.phonepeState = gatewayState;
      await payment.save({ session });

      await session.commitTransaction();
      session.endSession();

      // AFTER COMMIT — SEND PUSH
      const customer = await Customer.findById(payment.customer);
      if (customer?.fcmToken) {
        await sendPushNotification(customer.fcmToken, {
          title: "Order Received! ✅",
          body: "Your payment was successful! We've sent your order to the restaurant and are just waiting for them to accept.",
        });
      }

      const hotel = await Owner.findById(draft.hotel);
      if (hotel?.fcmToken) {
        await sendPushNotification(hotel.fcmToken, {
          title: "🚨 Incoming Order Request!",
          body: "Someone’s hungry and counting on you. Tap to accept.⚡️",
          android: {
            sound: "magicmenu_zing_enhanced",
            channelId: "custom-sound-channel",
          },
        });
      }

      return res.status(200).send("OK");
    } catch (txnErr) {
      await session.abortTransaction();
      session.endSession();
      logError("PhonePe Webhook Transaction Error", txnErr);
      return res.status(500).send("Server Error");
    }
  } catch (err) {
    logError("PhonePe Webhook Error", err);
    return res.status(500).send("Server Error");
  }
});

module.exports = router;
