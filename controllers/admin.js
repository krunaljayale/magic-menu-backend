const { generateWeeklySettlements } = require("../cron/weeklySettlement");
const Admin = require("../models/admin");
const Listing = require("../models/itemListing");
const Customer = require("../models/customer");
const Category = require("../models/category");
const PastOrder = require("../models/pastOrder");
const PaymentLog = require("../models/paymentLog");
const Rider = require("../models/rider");
const GlobalAlert = require("../models/globalAlert");
const RestaurantSettlement = require("../models/restaurantSettlement");
const LiveOrder = require("../models/liveOrder");
const Owner = require("../models/owner");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const admin = require("../config/firebaseAdmin");
const {
  cleanObject,
  buildMapUrls,
  formatLocationObject,
  toIsoOrNull,
} = require("../utils/controllerAPIUtil");

module.exports.registerAdmin = async (req, res) => {
  try {
    const { admin_id } = req.params;
    const { name, number, email, password, city, role } = req.body;

    // Check for missing fields
    if (!name || !number || !email || !password || !city) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const admin = await Admin.findById(admin_id).select("role");
    if (!admin || admin.role !== "SUPER_ADMIN") {
      return res
        .status(403)
        .json({ error: "❌ You are not authorized to create a new account." });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { number }],
    });

    if (existingAdmin) {
      let conflictField = "";

      if (existingAdmin.email === email) {
        conflictField = "email";
      } else if (parseInt(existingAdmin.number) === parseInt(number)) {
        conflictField = "mobile number";
      }

      return res.status(409).json({
        message: `Admin with this ${conflictField} already exists.`,
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const newAdmin = new Admin({
      name,
      number,
      email,
      password: hashedPassword,
      city: city.toUpperCase(),
      role,
    });

    await newAdmin.save();

    res.status(201).json({ message: "Admin account created successfully." });
  } catch (err) {
    console.error("Error registering admin:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

module.exports.loginAdmin = async (req, res) => {
  try {
    const { number, password } = req.body;

    if (!number || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Check if admin exists
    const admin = await Admin.findOne({ number });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found." });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Create JWT Token
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      userId: admin._id,
      name: admin.name,
      number: admin.number,
      role: admin.role,
    });
  } catch (err) {
    console.error("Error logging in admin:", err);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
};

module.exports.profileRoute = async (req, res) => {
  const { admin_id } = req.params;
  const profile = await Admin.findById(admin_id).select(
    "name number email role city"
  );
  res.status(200).json(profile);
};

module.exports.settleRestaurantSettlements = async (req, res) => {
  try {
    await generateWeeklySettlements();
    res.status(200).json({
      success: true,
      message: "Manual settlement generated successfully.",
    });
  } catch (err) {
    console.error("Manual settlement error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to generate manual settlements.",
      error: err.message,
    });
  }
};

// Send push notification contrller
module.exports.sendPushNotification = async (req, res) => {
  try {
    const { title, message } = req.body;

    if (!title || !message) {
      return res
        .status(400)
        .json({ message: "Title and message are required" });
    }

    // ✅ Find all customers who have notifications enabled and valid tokens
    const customers = await Customer.find({
      notificationsEnabled: true,
      fcmToken: { $exists: true, $not: { $size: 0 } },
    }).select("_id fcmToken");

    const tokens = customers.flatMap((c) =>
      Array.isArray(c.fcmToken) ? c.fcmToken : []
    );
    const uniqueTokens = [...new Set(tokens)];

    if (uniqueTokens.length === 0) {
      return res.status(200).json({ message: "No valid FCM tokens found" });
    }

    // 📣 Prepare FCM message
    const notification = {
      tokens: uniqueTokens,
      android: {
        notification: {
          title,
          body: message,
          sound: "magicmenu_zing_enhanced",
          channelId: "custom-sound-channel",
        },
      },
      data: {
        type: "ADMIN_NOTIFICATION",
        title,
        body: message,
      },
    };

    const failedTokens = [];

    // 🚀 Send notification (multicast preferred)
    if (typeof admin.messaging().sendMulticast === "function") {
      const response = await admin.messaging().sendMulticast(notification);
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-argument"
          ) {
            failedTokens.push(uniqueTokens[idx]);
          }
        }
      });
    } else {
      await Promise.all(
        uniqueTokens.map((token) =>
          admin
            .messaging()
            .send({
              token,
              android: notification.android,
              data: notification.data,
            })
            .catch((err) => {
              const code = err?.code;
              if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-argument"
              ) {
                failedTokens.push(token);
              }
            })
        )
      );
    }

    // 🧹 Clean invalid tokens from each customer
    if (failedTokens.length > 0) {
      await Promise.all(
        customers.map(async (customer) => {
          const validTokens = (customer.fcmToken || []).filter(
            (t) => !failedTokens.includes(t)
          );
          if (validTokens.length !== customer.fcmToken.length) {
            await Customer.findByIdAndUpdate(customer._id, {
              fcmToken: validTokens,
            });
          }
        })
      );
    }

    return res.status(200).json({
      message: `✅ Notification sent to customers. ${
        uniqueTokens.length - failedTokens.length
      } succeeded, ${failedTokens.length} tokens removed.`,
    });
  } catch (error) {
    console.error("Error in sendPushNotification:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Dashboard controllers
module.exports.getDashBodardData = async (req, res) => {
  try {
    // 1. Live Orders (status not in delivered/cancelled/rejected)
    const liveStatuses = [
      "PENDING",
      "PREPARING",
      "ACCEPTED",
      "PICKEDUP",
      "DROP",
    ];
    const liveOrders = await LiveOrder.countDocuments({
      status: { $in: liveStatuses },
    });

    // 2. Delivered Today (from PastOrder, deliveredAt is today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const deliveredToday = await PastOrder.countDocuments({
      status: "DELIVERED",
      deliveredAt: { $gte: todayStart },
    });

    // 3. Serving Restaurants (where isServing = true)
    const servingRestaurants = await Owner.countDocuments({ isServing: true });

    // 4. On-Duty Riders (where onDuty = true)
    const servingRiders = await Rider.countDocuments({ onDuty: true });

    return res.status(200).json({
      liveOrders,
      deliveredToday,
      servingRestaurants,
      servingRiders,
    });
  } catch (err) {
    console.error("Error in getDashBodardData:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Riders controllers
module.exports.getRegisteredRiders = async (req, res) => {
  try {
    const riders = await Rider.find()
      .select("name number onDuty isBlocked")
      .sort({ onDuty: -1, isBlocked: -1 });

    const enrichedRiders = await Promise.all(
      riders.map(async (rider) => {
        const riderId = rider._id;

        // Get unsettled COD amount
        const pastOrders = await PastOrder.find({ rider: riderId }).populate({
          path: "payment",
          match: { mode: "COD", isSettled: false },
          select: "amount",
        });

        const unsettledCODOrders = pastOrders.filter((order) => order.payment);
        const amountToDeposit = unsettledCODOrders.reduce((sum, order) => {
          return sum + (order.payment.amount || 0);
        }, 0);

        // Count live orders
        const liveOrderCount = await LiveOrder.countDocuments({
          rider: riderId,
        });

        return {
          _id: riderId,
          name: rider.name,
          number: rider.number,
          onDuty: rider.onDuty,
          isBlocked: rider.isBlocked,
          pendingCOD: amountToDeposit,
          todayOrders: liveOrderCount,
        };
      })
    );

    return res.status(200).json(enrichedRiders);
  } catch (err) {
    console.error("[GET /admin/get-registered-riders] Error:", err);
    return res.status(500).json({ message: "Failed to fetch riders." });
  }
};

module.exports.getRiderData = async (req, res) => {
  try {
    const { id } = req.params;

    const rider = await Rider.findById(id).select(
      "name number email gender dob isBlocked onDuty depositAmount isAvailable status createdAt updatedAt"
    );

    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    return res.status(200).json(rider);
  } catch (error) {
    console.error("[GET /admin/get-rider-data/:id] Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports.editRiderDeposit = async (req, res) => {
  const { id } = req.params;
  const { value } = req.body;

  try {
    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({ message: "Rider not found." });
    }

    const numericValue = Number(value);

    if (isNaN(numericValue)) {
      return res.status(400).json({ message: "Invalid deposit amount." });
    }

    rider.depositAmount = numericValue;
    await rider.save();

    return res.status(200).json({
      message: "Deposit amount updated successfully.",
      depositAmount: rider.depositAmount,
    });
  } catch (error) {
    console.error("[PUT /admin/edit-rider-deposit] Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports.toggleBlockRider = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    // Step 1: Validate the input
    if (typeof isBlocked !== "boolean") {
      return res
        .status(400)
        .json({ message: "Invalid value type. Expected boolean." });
    }

    // Step 2: Find the rider
    const rider = await Rider.findById(id);
    if (!rider) {
      return res.status(404).json({ message: "Rider not found." });
    }

    // Step 3: If trying to block the rider
    if (isBlocked) {
      if (rider.status !== "EMPTY") {
        return res.status(400).json({
          message: "Cannot block a rider who is currently serving an order.",
        });
      }

      rider.isBlocked = true;
      rider.onDuty = false;
    } else {
      // Unblock rider
      rider.isBlocked = false;
    }

    await rider.save();

    return res.status(200).json({
      message: `Rider has been ${
        isBlocked ? "blocked" : "unblocked"
      } successfully.`,
      updatedStatus: {
        isBlocked: rider.isBlocked,
        onDuty: rider.onDuty,
      },
    });
  } catch (error) {
    console.error("[PUT /admin/block-rider] Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports.getUnsettledOrders = async (req, res) => {
  const { id } = req.params;

  try {
    const orders = await PastOrder.find({
      status: "DELIVERED",
      rider: id,
    })
      .populate({
        path: "payment",
        match: { mode: "COD", isSettled: false },
        select: "status amount",
      })
      .populate({
        path: "customer",
        select: "name number",
      })
      .populate({
        path: "hotel",
        select: "hotel",
      })
      .sort({ deliveredAt: -1 });

    // Only keep orders with a valid matched payment
    const unsettledOrders = orders.filter((order) => order.payment);

    const result = unsettledOrders.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      deliveredAt: order.deliveredAt,
      totalPrice: order.totalPrice,
      payment: {
        status: order.payment.status,
        amount: order.payment.amount,
        _id: order.payment._id,
      },
      customer: {
        name: order.customer?.name || "Unknown",
        number: order.customer?.number || "N/A",
      },
      hotel: {
        name: order.hotel?.hotel || "Unknown",
      },
    }));

    return res.status(200).json({
      count: result.length,
      orders: result,
    });
  } catch (error) {
    console.error("Error fetching unsettled COD orders for rider:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports.markSettledOrders = async (req, res) => {
  const { admin_id } = req.params;
  const { selectedPaymentId } = req.body;

  // Validate input
  if (!Array.isArray(selectedPaymentId) || selectedPaymentId.length === 0) {
    return res.status(400).json({ message: "No payment IDs provided" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const admin = await Admin.findById(admin_id).session(session);
    if (!admin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Admin not found" });
    }

    // Optional: Restrict role
    // if (!["SUPER_ADMIN", "SETTLEMENT_MANAGER"].includes(admin.role)) {
    //   await session.abortTransaction();
    //   session.endSession();
    //   return res.status(403).json({ message: "Not authorized to settle orders" });
    // }

    // Loop over and update each payment in session
    for (const id of selectedPaymentId) {
      const result = await PaymentLog.findOneAndUpdate(
        { _id: id, isSettled: false },
        {
          isSettled: true,
          settledAt: new Date(),
          settledBy: admin._id,
        },
        { new: true, session }
      );

      if (!result) {
        throw new Error(`Payment ${id} not found or already settled`);
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "All selected orders marked as settled",
      updatedCount: selectedPaymentId.length,
    });
  } catch (err) {
    console.error("Error in settlement transaction:", err);
    await session.abortTransaction();
    session.endSession();
    return res
      .status(500)
      .json({ message: "Transaction failed", error: err.message });
  }
};

// Restaurant routes
module.exports.getRegisteredRestaurants = async (req, res) => {
  try {
    const TIMEZONE = "Asia/Kolkata";
    const now = moment.tz(TIMEZONE);
    const startOfToday = now.clone().startOf("day");
    const endOfToday = now.clone().endOf("day");

    // Week calculation (last Thursday to Wednesday)
    const currentDay = now.day();
    const daysSinceThursday = (currentDay + 3) % 7;
    const weekStart = now
      .clone()
      .subtract(daysSinceThursday, "days")
      .startOf("day");
    const weekEnd = weekStart.clone().add(6, "days").endOf("day");

    const owners = await Owner.find()
      .select("hotel number logo isServing")
      .sort({ isServing: -1, isBrand: -1 });

    const restaurantData = await Promise.all(
      owners.map(async (owner) => {
        const todayOrders = await PastOrder.countDocuments({
          hotel: owner._id,
          orderedAt: {
            $gte: startOfToday.toDate(),
            $lte: endOfToday.toDate(),
          },
          status: "DELIVERED",
        });

        const weeklyOrders = await PastOrder.find({
          hotel: owner._id,
          orderedAt: {
            $gte: weekStart.toDate(),
            $lte: weekEnd.toDate(),
          },
          status: "DELIVERED",
        });

        let grossRevenue = 0;
        weeklyOrders.forEach((order) => {
          order.items.forEach((item) => {
            grossRevenue += item.price * item.quantity;
          });
        });

        return {
          _id: owner._id,
          hotel: owner.hotel,
          number: owner.number,
          logo: owner.logo,
          isServing: owner.isServing,
          todayOrders,
          weeklySales: parseFloat(grossRevenue.toFixed(2)),
        };
      })
    );

    res.status(200).json(restaurantData);
  } catch (error) {
    console.error("Error fetching registered restaurants:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getRestaurantData = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid restaurant ID" });
  }

  try {
    const data = await Owner.findById(id).select(
      "hotel name number email location.address isServing isVeg isBrand createdAt"
    );

    if (!data) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const response = {
      _id: data._id,
      hotel: data.hotel,
      name: data.name,
      number: parseInt(data.number),
      email: data.email,
      address: data.location?.address || "",
      isServing: data.isServing ?? false,
      isVeg: data.isVeg ?? false,
      isBrand: data.isBrand ?? false,
      createdAt: data.createdAt,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching restaurant data:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.toggleRestaurantBrand = async (req, res) => {
  const { id } = req.params;
  const { isBrand } = req.body;

  try {
    await Owner.findByIdAndUpdate(id, {
      $set: { isBrand: isBrand },
    });

    res.status(200).json({ message: "Status changed successfully" });
  } catch (error) {
    console.error("Error toggling brand status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getWeeklyOrders = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid restaurant ID" });
  }

  try {
    const TIMEZONE = "Asia/Kolkata";
    const now = moment.tz(TIMEZONE);

    const currentDay = now.day(); // 0 = Sunday
    const daysSinceThursday = (currentDay + 3) % 7;
    const weekStart = now
      .clone()
      .subtract(daysSinceThursday, "days")
      .startOf("day");
    const weekEnd = weekStart.clone().add(6, "days").endOf("day");

    const orders = await PastOrder.find({
      hotel: id,
      orderedAt: { $gte: weekStart.toDate(), $lte: weekEnd.toDate() },
    })
      .populate({
        path: "payment",
        select: "mode status", // Fetching only required fields
      })
      .sort({ orderedAt: -1 });

    const formatted = orders.map((order) => ({
      _id: order._id.toString(),
      ticketNumber: order.ticketNumber,
      orderedAt: order.orderedAt.toISOString(),
      totalPrice: order.totalPrice,
      status: order.status,
      payment: {
        type: order.payment?.mode || "UNKNOWN",
        status: order.payment?.status,
      },
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching weekly orders:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getPendingPayouts = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Missing hotel ID" });
    }

    const settlements = await RestaurantSettlement.find({
      hotel: id,
      status: "PENDING",
    }).sort({ weekStart: -1 });

    return res.status(200).json(settlements);
  } catch (error) {
    console.error("❌ Error fetching weekly revenue report:", error.message);
    return res.status(500).json({ message: "Failed to fetch weekly report" });
  }
};

module.exports.getPaidPayouts = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Missing hotel ID" });
    }

    const settlements = await RestaurantSettlement.find({
      hotel: id,
      status: "PAID",
    })
      .sort({ weekStart: -1 })
      .populate({
        path: "paidBy",
        select: "name", // Add any fields you want to expose
      });

    return res.status(200).json(settlements);
  } catch (error) {
    console.error("❌ Error fetching paid payouts report:", error.message);
    return res.status(500).json({ message: "Failed to fetch paid payouts" });
  }
};

module.exports.payPendingPayout = async (req, res) => {
  const { id: hotelId } = req.params;
  const { data, admin_id } = req.body;

  const session = await mongoose.startSession();

  try {
    // Validate ObjectIDs
    if (
      !mongoose.Types.ObjectId.isValid(hotelId) ||
      !data?.id ||
      !mongoose.Types.ObjectId.isValid(data.id) ||
      !mongoose.Types.ObjectId.isValid(admin_id)
    ) {
      return res.status(400).json({ message: "Invalid ID(s) provided." });
    }

    await session.withTransaction(async () => {
      // Find the settlement with lock inside transaction
      const settlement = await RestaurantSettlement.findOne(
        {
          _id: data.id,
          hotel: hotelId,
          status: "PENDING",
        },
        null,
        { session }
      );

      if (!settlement) {
        throw new Error(
          "Pending settlement not found for the specified restaurant."
        );
      }

      // Update fields
      settlement.status = "PAID";
      settlement.paymentProofImageUrl = data.paymentProofImageUrl || "";
      settlement.paymentMode = data.paymentMode || "";
      settlement.remarks = data.remarks || "Marked as paid.";
      settlement.paidBy = admin_id;
      settlement.paidAt = new Date();

      await settlement.save({ session });
    });

    return res
      .status(200)
      .json({ message: "Payout marked as PAID successfully." });
  } catch (error) {
    console.error("Transaction failed:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error." });
  } finally {
    await session.endSession();
  }
};

// Orders details routes
module.exports.getLiveOrders = async (req, res) => {
  try {
    const orders = await LiveOrder.find()
      .sort({ orderedAt: -1 }) // optional: latest first
      .populate({
        path: "hotel",
        select: "hotel", // this gives the hotel name from Owner model
      })
      .select("_id ticketNumber hotel orderedAt totalPrice orderOtp status");

    const formattedOrders = orders.map((order) => ({
      orderId: order._id,
      orderTicketNumber: order.ticketNumber,
      hotelName: order.hotel?.hotel || "N/A",
      orderedOn: order.orderedAt,
      orderValue: order.totalPrice,
      orderOTP: order.orderOtp,
      status: order.status,
    }));

    res.status(200).json(formattedOrders);
  } catch (error) {
    console.error("Error fetching live orders:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports.getLiveOrderData = async (req, res) => {
  try {
    const { id } = req.params;
    const removeNull = req.query.removeNull
      ? String(req.query.removeNull).toLowerCase() === "true"
      : true;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or missing order id" });
    }

    const objectId = new mongoose.Types.ObjectId(id);

    const pipeline = [
      { $match: { _id: objectId } },

      // owners, riders, riderMeta, payment lookups (unchanged)
      {
        $lookup: {
          from: "owners",
          localField: "hotel",
          foreignField: "_id",
          as: "hotelDoc",
        },
      },
      {
        $lookup: {
          from: "riders",
          localField: "rider",
          foreignField: "_id",
          as: "riderDoc",
        },
      },
      {
        $lookup: {
          from: "ridermetadatas",
          localField: "riderMetaData",
          foreignField: "_id",
          as: "riderMetaDoc",
        },
      },
      {
        $lookup: {
          from: "paymentlogs",
          localField: "payment",
          foreignField: "_id",
          as: "paymentDoc",
        },
      },

      // items unwind + listing lookup
      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "listings",
          localField: "items.item",
          foreignField: "_id",
          as: "items.listingDoc",
        },
      },
      {
        $addFields: {
          "items.listingDoc": {
            $cond: [
              { $gt: [{ $size: "$items.listingDoc" }, 0] },
              {
                $arrayElemAt: [
                  {
                    $map: {
                      input: "$items.listingDoc",
                      as: "l",
                      in: {
                        _id: "$$l._id",
                        name: "$$l.name",
                        discountedPrice: "$$l.discountedPrice",
                        category: "$$l.category",
                        inStock: "$$l.inStock",
                        isVeg: "$$l.isVeg",
                      },
                    },
                  },
                  0,
                ],
              },
              null,
            ],
          },
        },
      },

      // group items back
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" },
          items: {
            $push: {
              $cond: [
                { $ifNull: ["$items", false] },
                { listing: "$items.listingDoc", quantity: "$items.quantity" },
                "$$REMOVE",
              ],
            },
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: { $mergeObjects: ["$doc", { items: "$items" }] },
        },
      },

      // lookup customer
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDoc",
        },
      },

      // compute selected location (if locArr exists and idx valid)
      {
        $addFields: {
          hotelDoc: { $arrayElemAt: ["$hotelDoc", 0] },
          riderDoc: { $arrayElemAt: ["$riderDoc", 0] },
          riderMetaDoc: { $arrayElemAt: ["$riderMetaDoc", 0] },
          paymentDoc: { $arrayElemAt: ["$paymentDoc", 0] },
          customerDoc: { $arrayElemAt: ["$customerDoc", 0] },
          customerSelectedLocation: {
            $let: {
              vars: {
                locArr: {
                  $ifNull: [{ $ifNull: ["$customerDoc.location", []] }, []],
                },
                idx: { $ifNull: ["$locationIndex", -1] },
              },
              in: {
                $cond: [
                  {
                    $and: [
                      { $isArray: "$$locArr" },
                      { $gte: ["$$idx", 0] },
                      { $lt: ["$$idx", { $size: "$$locArr" }] },
                    ],
                  },
                  { $arrayElemAt: ["$$locArr", "$$idx"] },
                  null,
                ],
              },
            },
          },
        },
      },

      // project requested fields; also include customerId so controller can fallback
      {
        $project: {
          _id: 1,
          ticketNumber: 1,
          orderOtp: 1,
          status: 1,
          restaurantStatus: 1,
          locationIndex: 1,
          remarks: 1,
          preparationTime: 1,
          orderedAt: 1,
          servedAt: 1,
          arrivedAt: 1,
          deliveredAt: 1,
          totalPrice: 1,
          createdAt: 1,
          updatedAt: 1,

          customerId: "$customerDoc._id", // <-- important fallback id
          customer: {
            name: "$customerDoc.name",
            number: "$customerDoc.number",
            location: "$customerSelectedLocation",
          },

          hotel: { hotel: "$hotelDoc.hotel", number: "$hotelDoc.number" },
          rider: { name: "$riderDoc.name", number: "$riderDoc.number" },

          riderMetaData: {
            acceptedAtTime: "$riderMetaDoc.acceptedAtTime",
            restaurantDistanceAtAccept:
              "$riderMetaDoc.restaurantDistanceAtAccept",
            customerDistanceAtAccept: "$riderMetaDoc.customerDistanceAtAccept",
            selfieAtRestaurant: "$riderMetaDoc.selfieAtRestaurant",
            reachedRestaurantAt: "$riderMetaDoc.reachedRestaurantAt",
            pickupConfirmedAt: "$riderMetaDoc.pickupConfirmedAt",
            dropAt: "$riderMetaDoc.dropAt",
          },

          payment: {
            transactionId: "$paymentDoc.transactionId",
            mode: "$paymentDoc.mode",
            status: "$paymentDoc.status",
            amount: "$paymentDoc.amount",
          },

          items: 1,
        },
      },

      { $addFields: { items: { $ifNull: ["$items", []] } } },
    ];

    const results = await LiveOrder.aggregate(pipeline).allowDiskUse(true);
    if (!results || results.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Live order not found" });
    }

    const doc = results[0];

    // ---------- Normalize customer ----------
    let normalizedCustomer = null;
    // attempt to use doc.customer.location (computed by pipeline)
    let loc =
      doc.customer && doc.customer.location ? doc.customer.location : null;

    // If pipeline left it as array for some reason, pick by locationIndex (safe)
    if (Array.isArray(loc)) {
      const idx =
        typeof doc.locationIndex === "number" && doc.locationIndex >= 0
          ? doc.locationIndex
          : 0;
      loc = loc.length > idx ? loc[idx] : loc.length > 0 ? loc[0] : null;
    }

    // If loc is still null, try a fallback DB fetch (only location field) using customerId
    if ((!loc || loc == null) && doc.customerId) {
      try {
        const fullCustomer = await Customer.findById(doc.customerId)
          .select("location")
          .lean();
        if (
          fullCustomer &&
          Array.isArray(fullCustomer.location) &&
          fullCustomer.location.length > 0
        ) {
          const idx =
            typeof doc.locationIndex === "number" && doc.locationIndex >= 0
              ? doc.locationIndex
              : 0;
          loc =
            fullCustomer.location.length > idx
              ? fullCustomer.location[idx]
              : fullCustomer.location[0];
        }
      } catch (e) {
        // swallow fallback error but keep loc null if fetch fails
        console.warn("customer fallback fetch failed:", e && e.message);
      }
    }

    // final safety: ensure object or null
    if (loc && typeof loc !== "object") loc = null;

    if (doc.customer && (doc.customer.name || doc.customer.number || loc)) {
      const locationFormatted = formatLocationObject(loc);
      let locationLatLng = null;
      if (
        loc &&
        typeof loc === "object" &&
        (loc.latitude !== undefined || loc.longitude !== undefined)
      ) {
        const lat =
          loc.latitude !== undefined && loc.latitude !== null
            ? Number(loc.latitude)
            : null;
        const lng =
          loc.longitude !== undefined && loc.longitude !== null
            ? Number(loc.longitude)
            : null;
        locationLatLng =
          lat !== null && lng !== null
            ? { latitude: lat, longitude: lng }
            : null;
      }
      const locationMapUrls = locationLatLng
        ? buildMapUrls(locationLatLng.latitude, locationLatLng.longitude)
        : null;

      normalizedCustomer = {
        name: doc.customer.name ?? null,
        number: doc.customer.number ?? null,
        location: loc ?? null,
        locationFormatted,
        locationLatLng,
        locationMapUrls,
      };
    }

    // ---------- Map items ----------
    const mappedItems = Array.isArray(doc.items)
      ? doc.items.map((it) => {
          const listingObj = it.listing || null;
          return {
            listingId:
              listingObj && listingObj._id ? String(listingObj._id) : null,
            name: listingObj ? listingObj.name ?? null : null,
            discountedPrice: listingObj
              ? listingObj.discountedPrice ?? null
              : null,
            category: listingObj ? listingObj.category ?? null : null,
            inStock: listingObj ? listingObj.inStock ?? null : null,
            isVeg: listingObj ? listingObj.isVeg ?? null : null,
            quantity: typeof it.quantity === "number" ? it.quantity : 0,
            subtotal:
              listingObj &&
              typeof listingObj.discountedPrice === "number" &&
              typeof it.quantity === "number"
                ? listingObj.discountedPrice * it.quantity
                : null,
          };
        })
      : [];

    const computedTotalFromItems = mappedItems.reduce(
      (acc, it) => (typeof it.subtotal === "number" ? acc + it.subtotal : acc),
      0
    );

    // ---------- Convert timeline dates to ISO ----------
    const dateFields = [
      "orderedAt",
      "servedAt",
      "arrivedAt",
      "deliveredAt",
      "updatedAt",
      "createdAt",
    ];
    const timelineDates = {};
    dateFields.forEach((f) => {
      const val = doc[f];
      if (val instanceof Date) timelineDates[f] = val.toISOString();
      else if (val != null) {
        const d = new Date(val);
        timelineDates[f] = isNaN(d.getTime()) ? null : d.toISOString();
      } else timelineDates[f] = null;
    });

    // ---------- Build payload ----------
    const payload = {
      success: true,
      data: {
        id: String(doc._id),
        ticketNumber: doc.ticketNumber ?? null,
        orderOtp: doc.orderOtp ?? null,
        status: doc.status ?? null,
        restaurantStatus: doc.restaurantStatus ?? null,
        customer: normalizedCustomer,
        hotel: doc.hotel ?? null,
        rider: doc.rider ?? null,
        riderMetaData: doc.riderMetaData ?? null,
        payment: doc.payment ?? null,
        locationIndex: doc.locationIndex ?? null,
        remarks: doc.remarks ?? null,
        items: mappedItems,
        computedTotalFromItems,
        totalPriceFromDB:
          typeof doc.totalPrice === "number" ? doc.totalPrice : null,
        timeline: {
          orderedAt: timelineDates.orderedAt,
          preparationTimeMinutes:
            typeof doc.preparationTime === "number"
              ? doc.preparationTime
              : null,
          servedAt: timelineDates.servedAt,
          arrivedAt: timelineDates.arrivedAt,
          deliveredAt: timelineDates.deliveredAt,
          updatedAt: timelineDates.updatedAt,
          createdAt: timelineDates.createdAt,
        },
      },
    };

    const finalPayload = removeNull
      ? { success: payload.success, data: cleanObject(payload.data) }
      : payload;
    return res.status(200).json(finalPayload);
  } catch (err) {
    console.error("getLiveOrderData (agg) error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports.getPastOrders = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  try {
    const skip = (page - 1) * limit;

    const orders = await PastOrder.find({})
      .sort({ orderedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "hotel",
        select: "hotel",
      })
      .populate({
        path: "rider",
        select: "name",
      })
      .lean();

    const formattedOrders = orders.map((order) => ({
      orderId: order._id,
      orderTicketNumber: order.ticketNumber,
      hotelName: order.hotel?.hotel || "N/A",
      orderedOn: order.orderedAt,
      orderValue: order.totalPrice,
      riderName: order.rider?.name || "Unassigned",
      status: order.status,
    }));

    res.status(200).json({
      orders: formattedOrders,
    });
  } catch (err) {
    console.error("[GET /admin/get-past-orders] Error:", err);
    res.status(500).json({ error: "Failed to fetch past orders" });
  }
};

module.exports.getPastOrderData = async (req, res) => {
  try {
    const { id } = req.params;
    const removeNull = req.query.removeNull ? String(req.query.removeNull).toLowerCase() === "true" : true;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid or missing order id" });
    }

    const objectId = new mongoose.Types.ObjectId(id);

    // Aggregation: join owner, rider, riderMetaData, payment, customer, and listings for item enrichment
    const pipeline = [
      { $match: { _id: objectId } },

      // lookups
      { $lookup: { from: "owners", localField: "hotel", foreignField: "_id", as: "hotelDoc" } },
      { $lookup: { from: "riders", localField: "rider", foreignField: "_id", as: "riderDoc" } },
      { $lookup: { from: "ridermetadatas", localField: "riderMetaData", foreignField: "_id", as: "riderMetaDoc" } },
      { $lookup: { from: "paymentlogs", localField: "payment", foreignField: "_id", as: "paymentDoc" } },
      { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "customerDoc" } },

      // unwind items so we can lookup listing for each snapshot listingId (optional enrichment)
      { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "listings", localField: "items.listingId", foreignField: "_id", as: "items.listingDoc" } },
      {
        $addFields: {
          "items.listingDoc": {
            $cond: [
              { $gt: [{ $size: "$items.listingDoc" }, 0] },
              { $arrayElemAt: ["$items.listingDoc", 0] },
              null,
            ],
          },
        },
      },

      // group back
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" },
          items: {
            $push: {
              $cond: [
                { $ifNull: ["$items", false] },
                {
                  listingId: "$items.listingId",
                  name: "$items.name",
                  price: "$items.price",
                  quantity: "$items.quantity",
                  listingDoc: "$items.listingDoc",
                },
                "$$REMOVE",
              ],
            },
          },
        },
      },

      // re-merge and pick first of lookups
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$doc", { items: "$items" }]
          }
        }
      },

      // pick single docs
      {
        $addFields: {
          hotelDoc: { $arrayElemAt: ["$hotelDoc", 0] },
          riderDoc: { $arrayElemAt: ["$riderDoc", 0] },
          riderMetaDoc: { $arrayElemAt: ["$riderMetaDoc", 0] },
          paymentDoc: { $arrayElemAt: ["$paymentDoc", 0] },
          customerDoc: { $arrayElemAt: ["$customerDoc", 0] }
        }
      },

      // final projection
      {
        $project: {
          _id: 1,
          ticketNumber: 1,
          orderOtp: 1,
          reason: 1,
          status: 1,
          remarks: 1,
          items: 1,
          deliveryAddress: 1,
          totalPrice: 1,
          orderedAt: 1,
          servedAt: 1,
          arrivedAt: 1,
          deliveredAt: 1,
          createdAt: 1,
          updatedAt: 1,
          customerId: "$customerDoc._id",
          customer: { name: "$customerDoc.name", number: "$customerDoc.number" },
          hotel: { hotel: "$hotelDoc.hotel", number: "$hotelDoc.number" },
          rider: { name: "$riderDoc.name", number: "$riderDoc.number" },
          riderMetaData: {
            acceptedAtTime: "$riderMetaDoc.acceptedAtTime",
            restaurantDistanceAtAccept: "$riderMetaDoc.restaurantDistanceAtAccept",
            customerDistanceAtAccept: "$riderMetaDoc.customerDistanceAtAccept",
            selfieAtRestaurant: "$riderMetaDoc.selfieAtRestaurant",
            reachedRestaurantAt: "$riderMetaDoc.reachedRestaurantAt",
            pickupConfirmedAt: "$riderMetaDoc.pickupConfirmedAt",
            dropAt: "$riderMetaDoc.dropAt"
          },
          payment: { transactionId: "$paymentDoc.transactionId", mode: "$paymentDoc.mode", status: "$paymentDoc.status", amount: "$paymentDoc.amount" }
        }
      }
    ];

    const results = await PastOrder.aggregate(pipeline).allowDiskUse(true);
    if (!results || results.length === 0) {
      return res.status(404).json({ success: false, message: "Past order not found" });
    }

    const doc = results[0];

    // Normalize delivery address -> customer.locationFormatted & map urls
    const addr = doc.deliveryAddress && typeof doc.deliveryAddress === "object" ? doc.deliveryAddress : null;
    const deliveryAddressFormatted = formatLocationObject(addr);
    let deliveryLatLng = null;
    if (addr && typeof addr === "object" && (addr.latitude !== undefined || addr.longitude !== undefined)) {
      const lat = addr.latitude !== undefined && addr.latitude !== null ? Number(addr.latitude) : null;
      const lng = addr.longitude !== undefined && addr.longitude !== null ? Number(addr.longitude) : null;
      deliveryLatLng = lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null;
    }
    const deliveryMapUrls = deliveryLatLng ? buildMapUrls(deliveryLatLng.latitude, deliveryLatLng.longitude) : null;

    // Normalize riderMetaData
    const rawRiderMeta = doc.riderMetaData || null;
    const riderMetaDataNormalized = rawRiderMeta
      ? {
          acceptedAtTime: toIsoOrNull(rawRiderMeta.acceptedAtTime),
          restaurantDistanceAtAccept: rawRiderMeta.restaurantDistanceAtAccept ?? null,
          customerDistanceAtAccept: rawRiderMeta.customerDistanceAtAccept ?? null,
          selfieAtRestaurant: rawRiderMeta.selfieAtRestaurant ?? null,
          reachedRestaurantAt: toIsoOrNull(rawRiderMeta.reachedRestaurantAt),
          pickupConfirmedAt: toIsoOrNull(rawRiderMeta.pickupConfirmedAt),
          dropAt: toIsoOrNull(rawRiderMeta.dropAt),
        }
      : null;

    // Map items: use snapshot fields (name, price, quantity) and enrich from listingDoc if present
    const mappedItems = Array.isArray(doc.items)
      ? doc.items.map((it) => {
          const listingDoc = it.listingDoc || null;
          const price = typeof it.price === "number" ? it.price : Number(it.price) || 0;
          const qty = typeof it.quantity === "number" ? it.quantity : Number(it.quantity) || 0;
          return {
            name: it.name ?? (listingDoc ? listingDoc.name ?? null : null),
            discountedPrice: price,
            quantity: qty,
            isVeg: listingDoc ? !!listingDoc.isVeg : null,
            category: listingDoc ? listingDoc.category ?? null : null,
          };
        })
      : [];

    const computedTotalFromItems = mappedItems.reduce(
      (acc, it) => acc + (typeof it.discountedPrice === "number" && typeof it.quantity === "number" ? it.discountedPrice * it.quantity : 0),
      0
    );

    // Normalize timeline dates (ISO)
    const dateFields = ["orderedAt", "servedAt", "arrivedAt", "deliveredAt", "createdAt", "updatedAt"];
    const timeline = {};
    dateFields.forEach((f) => {
      const v = doc[f];
      if (v instanceof Date) timeline[f] = v.toISOString();
      else if (v != null) {
        const d = new Date(v);
        timeline[f] = isNaN(d.getTime()) ? null : d.toISOString();
      } else timeline[f] = null;
    });

    // Build customer object expected by frontend (use deliveryAddress for location)
    const customerObj = doc.customer
      ? {
          name: doc.customer.name ?? null,
          number: doc.customer.number ?? null,
          locationFormatted: deliveryAddressFormatted,
          locationMapUrls: deliveryMapUrls,
        }
      : null;

    // Build payload
    const payload = {
      success: true,
      data: {
        id: String(doc._id),
        ticketNumber: doc.ticketNumber ?? null,
        orderOtp: doc.orderOtp ?? null,
        reason: doc.reason ?? null,
        status: doc.status ?? null,
        customer: customerObj,
        hotel: doc.hotel ?? null,
        rider: doc.rider ?? null,
        riderMetaData: riderMetaDataNormalized,
        payment: doc.payment ?? null,
        items: mappedItems,
        computedTotalFromItems,
        totalPriceFromDB: typeof doc.totalPrice === "number" ? doc.totalPrice : null,
        remarks: doc.remarks ?? null,
        timeline,
      }
    };

    const finalPayload = removeNull ? { success: payload.success, data: cleanObject(payload.data) } : payload;
    return res.status(200).json(finalPayload);
  } catch (err) {
    console.error("getPastOrderData error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

module.exports.getSearchedOrder = async (req, res) => {
  const { orderID } = req.params;

  try {
    const orders = await PastOrder.find({ ticketNumber: orderID })
      .populate({
        path: "hotel",
        select: "hotel",
      })
      .populate({
        path: "rider",
        select: "name",
      })
      .lean();

    const formattedOrders = orders.map((order) => ({
      orderId: order.ticketNumber,
      hotelName: order.hotel?.hotel || "N/A",
      orderedOn: order.orderedAt,
      orderValue: order.totalPrice,
      riderName: order.rider?.name || "Unassigned",
      status: order.status,
    }));

    return res.status(200).json({ orders: formattedOrders });
  } catch (error) {
    console.error("Error searching order:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
