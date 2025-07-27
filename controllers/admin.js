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
      .select("ticketNumber hotel orderedAt totalPrice orderOtp status");

    const formattedOrders = orders.map((order) => ({
      orderId: order.ticketNumber,
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
      orderId: order.ticketNumber,
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
