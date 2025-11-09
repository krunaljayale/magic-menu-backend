const Rider = require("../models/rider");
const LiveOrder = require("../models/liveOrder");
const Customer = require("../models/customer");
const Owner = require("../models/owner");
const Listing = require("../models/itemListing");
const RiderMetaData = require("../models/riderMetaData");
const PaymentLog = require("../models/paymentLog");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../utils/brevoEmailSender");
const { default: mongoose } = require("mongoose");
const { calculateDistance, calculateTravelTime } = require("../utils/mapUtils");
const PastOrder = require("../models/pastOrder");
const admin = require("../config/firebaseAdmin");

module.exports.getOTP = async (req, res) => {
  const { name, email, number } = req.body;

  const existingUser = await Rider.findOne({
    $or: [{ email: email }, { number: number }], // Check for matching email or phone number
  });

  if (existingUser) {
    return res.status(400).json({
      status: "Error",
      message: "Rider already registered with this email or phone number",
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  const emailResponse = await sendEmail(name, email, otp);
  if (emailResponse.status === 200) {
    return res.status(200).json({
      status: "Success",
      message: "OTP created successfully and email sent",
      otp: otp, // Include OTP in the response
    });
  } else {
    return res.status(500).json({
      status: "Error",
      message: "OTP created, but failed to send email",
    });
  }
};

module.exports.registerData = async (req, res) => {
  const { name, number, email, pass } = req.body;

  // Check for missing fields
  if (!name || !number || !email || !pass) {
    return res
      .status(400)
      .json({ status: "Error", message: "Missing required fields" });
  }

  try {
    // Check if the email or phone number is already in use
    const existingUser = await Rider.findOne({
      $or: [{ email: email }, { number: number }],
    });

    if (existingUser) {
      return res.status(400).json({
        status: "Error",
        message: "Rider already registered with this email or phone number",
      });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(pass, 10); // Hash with salt rounds = 10

    // Create a new user with hashed password
    const newUser = new Rider({
      name: name,
      email: email,
      number: number,
      password: hashedPassword, // Store hashed password
    });

    // Save the user and await the operation
    await newUser.save();

    // Send a success response
    return res.status(201).json({
      status: "Success",
      message: "Rider registered successfully",
    });
  } catch (error) {
    console.error("Error in registerData:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error",
    });
  }
};

module.exports.login = async (req, res) => {
  const { number, pass } = req.body;

  // Check for missing fields
  if (!number || !pass) {
    return res.status(400).json({
      status: "Error",
      message: "Number and password are required",
    });
  }

  try {
    // Find user by number
    const user = await Rider.findOne({ number: number });

    // If user does not exist
    if (!user) {
      return res.status(404).json({
        status: "Error",
        message: "User does not exist. Please check the number and try again.",
      });
    }

    // Compare the provided password with the hashed password
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      return res.status(401).json({
        status: "Error",
        message: "Incorrect password. Please try again.",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, number: user.number },
      process.env.JWT_SECRET, // Ensure this is stored in an .env file
      { expiresIn: "21d" } // Token valid for 21 days
    );

    // Send token in response
    return res.status(200).json({
      status: "Success",
      message: "User validated successfully",
      token: token, // Token for frontend authentication
      user: user, // Send the user_id along with the token
    });
  } catch (error) {
    console.error("Error in login:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error. Please try again later.",
    });
  }
};

module.exports.auth = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate the ID format and existence
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid or Missing ID" });
    }

    // Fetch rider data excluding password using select
    const data = await Rider.findById(id)
      .select("name number email onDuty isAvailable servingOrder status")
      .lean();

    // Check if rider exists
    if (!data) {
      return res.status(404).json({ message: "Rider not found" });
    }

    // Send success response
    return res.status(200).json(data);
  } catch (e) {
    console.error("Error in Rider Auth route:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.registerFCM = async (req, res) => {
  const { id } = req.params;
  const { token } = req.body;

  try {
    const rider = await Rider.findById(id);

    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    // Ensure fcmToken is initialized
    if (!Array.isArray(rider.fcmToken)) {
      rider.fcmToken = [];
    }

    // Add token only if it doesn't already exist
    if (!rider.fcmToken.includes(token)) {
      rider.fcmToken.push(token);
      await rider.save();
    }

    return res.status(200).json({ message: "FCM Token saved successfully" });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.toggleDuty = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Validate ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid or Missing ID" });
    }

    // 2️⃣ Fetch rider with current onDuty and isBlocked status
    const rider = await Rider.findById(id).select("onDuty isBlocked");
    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    // 3️⃣ If rider is blocked and trying to go ON duty, block it
    if (rider.isBlocked && !rider.onDuty) {
      return res.status(403).json({
        status: "BLOCKED",
        message: "You must deposit collected amount to go on-duty.",
      });
    }

    // 4️⃣ Toggle duty using $not operator
    const result = await Rider.updateOne({ _id: id }, [
      { $set: { onDuty: { $not: "$onDuty" } } },
    ]);

    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: "Duty status unchanged." });
    }

    // ✅ Success
    return res
      .status(200)
      .json({ message: "Duty status updated successfully." });
  } catch (e) {
    console.error("Error at toggleDuty API:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.newOrder = async (req, res) => {
  try {
    const { rider_latitude, rider_longitude, riderId } = req.body;
    
    const rider = await Rider.findById(riderId);
    if (rider.isBlocked) {
      return res
        .status(404)
        .json({ status: "BLOCKED", message: "Rider is blocked." });
    }

    const liveOrders = await LiveOrder.find({
      restaurantStatus: { $in: ["ALMOST_READY", "READY"] },
      status: "PREPARING",
    })
      .select("hotel customer locationIndex ticketNumber")
      .lean();

    if (liveOrders.length === 0) {
      return res
        .status(404)
        .json({ status: "Failure", message: "No orders to deliver." });
    }

    const orderResponses = await Promise.all(
      liveOrders.map(async (order) => {
        let hotelName = "N/A";
        let hotelAddress = "N/A";
        let hotelDistance = 0;
        let hotelTravelTime = 0;
        let customerDistance = 0;

        let hotelCoords = null;

        try {
          const hotel = await Owner.findById(order.hotel)
            .select("hotel location")
            .lean();

          if (hotel?.location) {
            hotelName = hotel.hotel;
            hotelAddress = hotel.location.address || "N/A";

            hotelCoords = {
              latitude: hotel.location.latitude,
              longitude: hotel.location.longitude,
            };

            hotelDistance = Math.round(
              calculateDistance(
                rider_latitude,
                rider_longitude,
                hotelCoords.latitude,
                hotelCoords.longitude
              )
            );

            hotelTravelTime = calculateTravelTime(hotelDistance);
          }
        } catch (err) {
          console.warn(
            `Hotel fetch failed for order ${order._id}:`,
            err.message
          );
        }

        try {
          const customer = await Customer.findById(order.customer)
            .select("location")
            .lean();

          if (Array.isArray(customer?.location)) {
            const coords = customer.location[order.locationIndex];

            if (coords && hotelCoords) {
              customerDistance = Math.round(
                calculateDistance(
                  hotelCoords.latitude,
                  hotelCoords.longitude,
                  coords.latitude,
                  coords.longitude
                )
              );
            }
          }
        } catch (err) {
          console.warn(
            `Customer fetch failed for order ${order._id}:`,
            err.message
          );
        }

        return {
          _id: order._id,
          ticketNumber: order.ticketNumber,
          hotelName,
          hotelAddress,
          hotelDistance, // rider → hotel
          hotelTravelTime,
          customerDistance, // ✅ hotel → customer (updated)
          timer: 0,
        };
      })
    );

    return res.status(200).json({
      status: "SUCCESS",
      orders: orderResponses,
    });
  } catch (error) {
    console.error("Error in newOrder:", error);
    return res.status(500).json({ status: "Failure", message: error.message });
  }
};

module.exports.changeStatus = async (req, res) => {
  try {
    const { id, _id, status } = req.params;
    if (!id || !_id || !status) {
      return res
        .status(400)
        .json({ message: "Missing id, _id, or status parameter" });
    }

    // 1️⃣ Claim or update the order
    const updated = await LiveOrder.findOneAndUpdate(
      {
        _id,
        $or: [
          { rider: { $exists: false } }, // not yet claimed
          { rider: id }, // already by this rider
        ],
      },
      { status, rider: id },
      { new: true }
    );
    if (!updated) {
      return res
        .status(403)
        .json({ message: "Order already assigned to another rider" });
    }

    // 2️⃣ Fetch customer FCM tokens
    const customer = await Customer.findById(updated.customer);
    // Check if customer exists and has notifications enabled
    if (!customer || !customer.notificationsEnabled) {
      return; // ❌ Don't send notification
    }
    let tokens = Array.isArray(customer.fcmToken) ? customer.fcmToken : [];

    // 3️⃣ Only notify on these two statuses
    const notifyStatuses = ["PICKEDUP", "DROP"];
    if (notifyStatuses.includes(updated.status) && tokens.length) {
      // 4️⃣ Build payload
      let message;
      if (updated.status === "PICKEDUP") {
        message = {
          tokens,
          android: {
            notification: {
              title: "🍽️ Your food is on the way!",
              body: "Our delivery partner has picked up your order and is heading to you.",
              sound: "magicmenu_zing_enhanced",
              channelId: "custom-sound-channel",
            },
          },
          data: {
            type: "ORDER_PICKED_UP",
            title: "🍽️ Your food is on the way!",
            body: "Our delivery partner has picked up your order and is heading to you.",
          },
        };
      } else {
        message = {
          tokens,
          android: {
            notification: {
              title: "🏠 Your order has arrived!",
              body: "Your food has arrived! Please collect it at your door.",
              sound: "magicmenu_zing_enhanced",
              channelId: "custom-sound-channel",
            },
          },
          data: {
            type: "ORDER_DELIVERED",
            title: "🏠 Your order has arrived!",
            body: "Your food has arrived! Please collect it at your door.",
          },
        };
      }

      // 5️⃣ Send message and handle token errors
      const failedTokens = [];

      if (typeof admin.messaging().sendMulticast === "function") {
        const response = await admin.messaging().sendMulticast(message);
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            // console.error(
            //   "FCM error for token",
            //   tokens[idx],
            //   resp.error?.message
            // );
            failedTokens.push(tokens[idx]);
          }
        });
      } else {
        await Promise.all(
          tokens.map((token) =>
            admin
              .messaging()
              .send({
                token,
                android: message.android,
                data: message.data,
              })
              .catch((err) => {
                console.error("FCM error for token", token, err.message);
                failedTokens.push(token);
              })
          )
        );
      }

      // 6️⃣ Remove failed tokens from customer's FCM tokens
      if (failedTokens.length > 0) {
        const filtered = tokens.filter(
          (token) => !failedTokens.includes(token)
        );
        await Customer.findByIdAndUpdate(customer._id, {
          fcmToken: filtered,
        });
      }
    }

    // 7️⃣ Mark rider as busy
    await Rider.findByIdAndUpdate(id, {
      isAvailable: false,
      servingOrder: _id,
    });

    return res
      .status(200)
      .json({ message: "Status and rider updated successfully" });
  } catch (error) {
    console.error("Error in changeStatus:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getHotelData = async (req, res) => {
  try {
    const { id } = req.params;

    const liveOrder = await LiveOrder.findById(id);
    if (!liveOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    const hotel = await Owner.findById(liveOrder.hotel);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    res.status(200).json({
      hotelName: hotel.hotel,
      hotelAddress: hotel.location.address,
      hotelPhone: hotel.number,
      hotelCoords: {
        latitude: hotel.location.latitude,
        longitude: hotel.location.longitude,
      },
    });
  } catch (err) {
    console.error("Error in getOrderData:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.getOrderData = async (req, res) => {
  const { id } = req.params;

  try {
    const liveOrder = await LiveOrder.findById(id)
      .populate("items.item") // Populate item details from Listing model
      .exec();

    if (!liveOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    const hotel = await Owner.findById(liveOrder.hotel);
    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    // Transform items to include only name and quantity
    const orderItems = liveOrder.items.map((orderItem) => ({
      name: orderItem.item.name, // Assumes Listing schema has a 'name' field
      quantity: orderItem.quantity,
    }));

    res.status(200).json({
      orderNumber: liveOrder.ticketNumber,
      hotelName: hotel.hotel,
      orderItems: orderItems,
    });
  } catch (error) {
    console.error("Error fetching order data:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.getCustomerData = async (req, res) => {
  try {
    const { id } = req.params;

    const liveOrder = await LiveOrder.findById(id);
    if (!liveOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    const customer = await Customer.findById(liveOrder.customer).select(
      "name number location"
    );
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const index = liveOrder.locationIndex;
    const location = customer.location?.[index];

    if (!location) {
      return res.status(404).json({ message: "Customer location not found" });
    }

    // Construct full address string
    let address = `House No. ${location.houseNo}, ${location.buildingNo}`;
    if (location.landmark) {
      address += `, Landmark: ${location.landmark}`;
    }

    res.status(200).json({
      customerName: customer.name,
      customerPhone: customer.number,
      customerAddress: address,
      customerCords: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    });
  } catch (err) {
    console.error("Error in getCustomerData:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.getCompleteOrderData = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Find the live order, populate items + payment
    const liveOrder = await LiveOrder.findById(id)
      .populate("items.item", "name")
      .populate("payment") // fetch payment log
      .exec();

    if (!liveOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2️⃣ Format order items
    const orderItems = liveOrder.items.map((orderItem) => ({
      name: orderItem.item?.name || "Unknown Item",
      quantity: orderItem.quantity,
    }));

    const orderData = {
      orderNumber: liveOrder.ticketNumber,
      orderItems,
    };

    // 3️⃣ Get customer and address
    const customer = await Customer.findById(liveOrder.customer).select(
      "name number location"
    );
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const index = liveOrder.locationIndex ?? 0;
    const location = customer.location?.[index];

    if (!location || location.houseNo == null || location.buildingNo == null) {
      return res.status(404).json({ message: "Customer location not found" });
    }

    const customerData = {
      customerName: customer.name,
      customerPhone: customer.number,
      customerAddress: `House No. ${location.houseNo}, ${location.buildingNo}, ${location.landmark}`,
    };

    // 4️⃣ Handle payment status
    const paymentStatus = liveOrder.payment?.status || "UNKNOWN";
    const amountToCollect =
      paymentStatus === "NOT_COLLECTED" ? liveOrder.payment?.amount : null;

    return res.status(200).json({
      orderData,
      customerData,
      paymentStatus,
      ...(amountToCollect !== null && { amountToCollect }),
    });
  } catch (error) {
    console.error("Error in getCompleteOrderData:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getCollectionReport = async (req, res) => {
  const { user_id } = req.params;

  try {
    // Get all past COD orders served by this rider where payment is NOT settled
    const orders = await PastOrder.find({ rider: user_id }).populate({
      path: "payment",
      match: { mode: "COD", isSettled: false },
      select: "amount",
    });

    const unsettledCODOrders = orders.filter((order) => order.payment);

    const amountToDeposit = unsettledCODOrders.reduce((total, order) => {
      return total + (order.payment.amount || 0);
    }, 0);

    // Get deposit amount from Rider schema
    const rider = await Rider.findById(user_id).select("depositAmount");
    if (!rider) {
      return res.status(404).json({ message: "Rider not found" });
    }

    return res.status(200).json({
      amountToDeposit,
      depositAmount: rider.depositAmount,
    });
  } catch (error) {
    console.error("Error fetching collection report:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getUnsettledOrders = async (req, res) => {
  const { user_id } = req.params;

  try {
    const orders = await PastOrder.find({
      rider: user_id,
      status: "DELIVERED",
    })
      .populate({
        path: "payment",
        match: { mode: "COD", isSettled: false },
        select: "amount",
      })
      .populate({
        path: "hotel",
        select: "hotel", // returns the hotel name
      })
      .sort({ deliveredAt: -1 }); // latest first

    const filteredOrders = orders.filter((order) => order.payment);

    const result = filteredOrders.map((order) => ({
      orderId: order._id,
      ticketNumber: order.ticketNumber,
      deliveredAt: order.deliveredAt,
      amount: order.payment.amount,
      totalPrice: order.totalPrice,
      hotelName: order.hotel?.hotel || "Hotel",
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
      })),
    }));

    return res.status(200).json({ count: result.length, orders: result });
  } catch (error) {
    console.error("Error fetching unsettled orders:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Delivery Controller

module.exports.acceptOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { user_id } = req.params;
    const {
      order_id,
      rider_latitude,
      rider_longitude,
      hotelDistance,
      customerDistance,
    } = req.body;

    if (
      !user_id ||
      !order_id ||
      typeof rider_latitude !== "number" ||
      typeof rider_longitude !== "number" ||
      typeof hotelDistance !== "number" ||
      typeof customerDistance !== "number"
    ) {
      return res.status(400).json({ message: "Missing or invalid parameters" });
    }

    // Step 1️⃣ Try to atomically claim or reclaim the order
    const updatedOrder = await LiveOrder.findOneAndUpdate(
      {
        _id: order_id,
        $or: [
          { rider: { $exists: false } }, // no one claimed yet
          { rider: user_id }, // same rider reclaiming
        ],
      },
      {
        $set: {
          status: "ACCEPTED",
          rider: user_id,
        },
      },
      { new: true, session }
    );

    // Step 2️⃣ Reject if another rider has already claimed
    if (!updatedOrder) {
      await session.abortTransaction();
      return res
        .status(403)
        .json({ message: "Order already accepted by another rider" });
    }

    // Step 3️⃣ If riderMetaData already exists (from earlier reclaim), skip creating new one
    if (!updatedOrder.riderMetaData) {
      const riderMeta = new RiderMetaData({
        riderId: user_id,
        acceptedAtLocation: {
          latitude: rider_latitude,
          longitude: rider_longitude,
        },
        acceptedAtTime: Date.now(),
        restaurantDistanceAtAccept: hotelDistance,
        customerDistanceAtAccept: customerDistance,
      });

      await riderMeta.save({ session });

      updatedOrder.riderMetaData = riderMeta._id;
      await updatedOrder.save({ session });
    }

    // Step 4️⃣ Update rider status
    await Rider.findByIdAndUpdate(
      user_id,
      {
        isAvailable: false,
        servingOrder: order_id,
        status: "ACCEPTED",
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ message: "Order accepted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.reachedPickup = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { imageURL } = req.body;

    if (!user_id || !imageURL) {
      return res.status(400).json({ message: "Missing user_id or imageURL" });
    }

    // 1️⃣ Update metadata
    const updatedMeta = await RiderMetaData.findOneAndUpdate(
      { riderId: user_id },
      {
        selfieAtRestaurant: imageURL,
        reachedRestaurantAt: Date.now(),
      },
      { new: true }
    );

    if (!updatedMeta) {
      return res.status(404).json({ message: "Rider metadata not found" });
    }

    // 2️⃣ Update rider status
    await Rider.findByIdAndUpdate(user_id, {
      status: "REACHED",
    });

    return res
      .status(200)
      .json({ message: "Rider marked as reached at restaurant" });
  } catch (error) {
    console.error("Error in reachedPickup:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.orderPickedup = async (req, res) => {
  const { user_id } = req.params;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 🔍 Find the live order for this rider (before updating anything)
    const liveOrder = await LiveOrder.findOne({ rider: user_id })
      .populate("customer")
      .session(session);

    if (!liveOrder || !liveOrder.customer) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order or customer not found" });
    }

    // ⛔ Check restaurantStatus === "READY"
    if (liveOrder.restaurantStatus !== "READY") {
      await session.abortTransaction();
      return res.status(400).json({
        code: "DENIED",
        message: "⛔ Can't pick up: Order not marked as READY",
      });
    }

    // ✅ Update RiderMetaData
    const updatedMeta = await RiderMetaData.findOneAndUpdate(
      { riderId: user_id },
      { pickupConfirmedAt: Date.now() },
      { new: true, session }
    );
    if (!updatedMeta) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Rider metadata not found" });
    }

    // ✅ Update rider status
    await Rider.findByIdAndUpdate(user_id, { status: "PICKEDUP" }, { session });

    // ✅ Update LiveOrder status
    liveOrder.status = "PICKEDUP";
    await liveOrder.save({ session });

    const customer = liveOrder.customer;
    const tokens = Array.isArray(customer.fcmToken) ? customer.fcmToken : [];

    // ✅ Commit transaction
    await session.commitTransaction();
    session.endSession();

    // 📣 Prepare FCM (outside transaction)
    if (!tokens.length || !customer.notificationsEnabled) {
      return res.status(200).json({
        message: "Order marked as picked up (no notifications sent)",
      });
    }

    const message = {
      tokens,
      android: {
        notification: {
          title: "🍽️ Your food is on the way!",
          body: "Our delivery partner has picked up your order and is heading to you.",
          sound: "magicmenu_zing_enhanced",
          channelId: "custom-sound-channel",
        },
      },
      data: {
        type: "ORDER_PICKED_UP",
        title: "🍽️ Your food is on the way!",
        body: "Our delivery partner has picked up your order and is heading to you.",
      },
    };

    // 🚀 Send FCM
    const failedTokens = [];

    if (typeof admin.messaging().sendMulticast === "function") {
      const response = await admin.messaging().sendMulticast(message);
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
    } else {
      await Promise.all(
        tokens.map((token) =>
          admin
            .messaging()
            .send({ token, android: message.android, data: message.data })
            .catch(() => failedTokens.push(token))
        )
      );
    }

    // 🧹 Clean up invalid tokens
    if (failedTokens.length > 0) {
      const filtered = tokens.filter((t) => !failedTokens.includes(t));
      await Customer.findByIdAndUpdate(customer._id, { fcmToken: filtered });
    }

    return res.status(200).json({
      message: "Rider marked order as picked up from restaurant",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in orderPickedup:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.orderReachedDrop = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { user_id } = req.params;

    // 1️⃣ Update RiderMetaData
    const updatedMeta = await RiderMetaData.findOneAndUpdate(
      { riderId: user_id },
      { dropAt: Date.now() },
      { new: true, session }
    );

    if (!updatedMeta) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Rider metadata not found" });
    }

    // 2️⃣ Update rider status
    await Rider.findByIdAndUpdate(user_id, { status: "DROP" }, { session });

    // 3️⃣ Find live order + customer
    const liveOrder = await LiveOrder.findOne({ rider: user_id })
      .populate("customer")
      .session(session);

    if (!liveOrder || !liveOrder.customer) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order or customer not found" });
    }

    liveOrder.status = "DROP";
    await liveOrder.save({ session });

    await session.commitTransaction();
    session.endSession();

    // 🟡 FCM (run *outside* transaction)
    const customer = liveOrder.customer;
    const tokens = Array.isArray(customer.fcmToken) ? customer.fcmToken : [];

    if (tokens.length && customer.notificationsEnabled) {
      const message = {
        tokens,
        android: {
          notification: {
            title: "🏠 Your order has arrived!",
            body: "Your food has arrived! Please collect it at your door.",
            sound: "magicmenu_zing_enhanced",
            channelId: "custom-sound-channel",
          },
        },
        data: {
          type: "ORDER_DELIVERED",
          title: "🏠 Your order has arrived!",
          body: "Your food has arrived! Please collect it at your door.",
        },
      };

      try {
        if (typeof admin.messaging().sendMulticast === "function") {
          await admin.messaging().sendMulticast(message);
        } else {
          await Promise.all(
            tokens.map((token) =>
              admin.messaging().send({
                token,
                android: message.android,
                data: message.data,
              })
            )
          );
        }
      } catch (fcmError) {
        console.warn("FCM error (ignored):", fcmError.message);
        // Not blocking, just log
      }
    }

    return res.status(200).json({
      message: "Rider marked order as reached drop location",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in orderReachedDrop:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.completeOrder = async (req, res) => {
  const { order_id } = req.params;
  const { rider_id, otp } = req.body;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1️⃣ Find the live order
    const liveOrder = await LiveOrder.findById(order_id).session(session);
    if (!liveOrder) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Live order not found" });
    }

    // 2️⃣ OTP validation
    if (parseInt(liveOrder.orderOtp) !== parseInt(otp)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // 3️⃣ Fetch customer & delivery address
    const customer = await Customer.findById(liveOrder.customer).session(
      session
    );
    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Customer not found" });
    }

    const deliveryLocation = customer.location[liveOrder.locationIndex];
    if (!deliveryLocation) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid location index" });
    }

    // 4️⃣ Denormalize order items
    const transformedItems = await Promise.all(
      liveOrder.items.map(async (orderItem) => {
        const listing = await Listing.findById(orderItem.item).session(session);
        return {
          listingId: listing._id,
          name: listing.name,
          price: listing.discountedPrice,
          quantity: orderItem.quantity,
        };
      })
    );

    // 5️⃣ Update order status
    liveOrder.status = "DELIVERED";
    liveOrder.deliveredAt = new Date();

    // 6️⃣ Build past order object
    const pastOrderData = {
      ticketNumber: liveOrder.ticketNumber,
      orderOtp: liveOrder.orderOtp,
      status: "DELIVERED",
      customer: liveOrder.customer,
      hotel: liveOrder.hotel,
      rider: liveOrder.rider,
      riderMetaData: liveOrder.riderMetaData,
      deliveryAddress: deliveryLocation,
      items: transformedItems,
      remarks: liveOrder.remarks,
      orderedAt: liveOrder.orderedAt,
      preparationTime:liveOrder.preparationTime,
      servedAt: liveOrder.servedAt,
      arrivedAt: liveOrder.arrivedAt,
      deliveredAt: liveOrder.deliveredAt,
      totalPrice: liveOrder.totalPrice,
      payment: liveOrder.payment,
    };

    // 7️⃣ Save past order
    await new PastOrder(pastOrderData).save({ session });

    // 8️⃣ Update PaymentLog (COD only)
    if (liveOrder.payment) {
      await PaymentLog.findOneAndUpdate(
        { _id: liveOrder.payment, status: "NOT_COLLECTED" },
        { status: "SUCCESS" },
        { session }
      );
    }

    // 9️⃣ Delete LiveOrder
    await liveOrder.deleteOne({ session });

    // 🔟 Update rider availability
    await Rider.findByIdAndUpdate(
      rider_id,
      {
        isAvailable: true,
        servingOrder: null,
        status: "EMPTY",
      },
      { session }
    );

    await RiderMetaData.findOneAndUpdate(
      { riderId: rider_id },
      { deliveredAt: Date.now() },
      { new: true, session }
    );

    // ✅ Commit transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Order marked as delivered and moved to past orders.",
    });

    setImmediate(async () => {
      try {
        const pastCODOrders = await PastOrder.find({
          rider: rider_id,
        }).populate({
          path: "payment",
          match: { mode: "COD", isSettled: false },
          select: "amount",
        });

        const unsettled = pastCODOrders.filter((order) => order.payment);
        const totalUnsettledAmount = unsettled.reduce((sum, order) => {
          return sum + (order.payment.amount || 0);
        }, 0);

        const rider = await Rider.findById(rider_id).select("depositAmount");
        if (rider) {
          const shouldBlock =
            totalUnsettledAmount >= rider.depositAmount * 0.95;
          await Rider.findByIdAndUpdate(rider_id, { isBlocked: shouldBlock });
        }
      } catch (blockCheckError) {
        console.error("Post-delivery block check failed:", blockCheckError);
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error completing order:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.profileInfo = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid Rider ID format" });
    }

    // Get rider profile
    const rider = await Rider.findById(id).select(
      "name number email dob gender depositAmount"
    );

    if (!rider) {
      return res.status(404).json({ error: "Rider not found" });
    }

    // Get collection amount (unsettled COD payments)
    const orders = await PastOrder.find({ rider: id }).populate({
      path: "payment",
      match: { mode: "COD", isSettled: false },
      select: "amount",
    });

    const unsettledCODOrders = orders.filter((order) => order.payment);

    const amountToDeposit = unsettledCODOrders.reduce((total, order) => {
      return total + (order.payment.amount || 0);
    }, 0);

    return res.status(200).json({
      ...rider.toObject(),
      amountToDeposit,
    });
  } catch (error) {
    console.error("Error fetching rider profile:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.profileEdit = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid Rider ID format" });
    }

    const rider = await Rider.findById(id);
    if (!rider) {
      return res.status(404).json({ error: "Rider not found" });
    }

    const { name, number, email, dob, gender } = req.body;

    // Update only allowed fields if provided
    if (name !== undefined) rider.name = name;
    if (number !== undefined) rider.number = number;
    if (email !== undefined) rider.email = email;
    if (dob !== undefined) rider.dob = new Date(dob);
    if (gender !== undefined) rider.gender = gender;

    await rider.save();

    return res
      .status(200)
      .json({ message: "Profile updated successfully", rider });
  } catch (error) {
    console.error("Error updating rider profile:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.sendTestNotification = async (req, res) => {
  const { id } = req.params;

  try {
    const rider = await Owner.findById(id);

    if (!rider || !rider.fcmToken?.length) {
      return res.status(404).json({ message: "Rider or token not found" });
    }

    // ✅ Notification payload
    const message = {
      tokens: rider.fcmToken,
      // notification: {},
      android: {
        notification: {
          title: "Test Notification 🚴‍♂️",
          body: "This is a test push notification from MagicMenu backend!",
          sound: "magicmenu_zing_enhanced",
          channelId: "custom-sound-channel",
        },
      },
      data: {
        type: "NEW_ORDER",
        title: "Test Notification 🚴‍♂️",
        body: "This is a test push notification from MagicMenu backend!",
      },
    };

    // ✅ Send multicast if supported (recommended)
    if (typeof admin.messaging().sendMulticast === "function") {
      const response = await admin.messaging().sendMulticast(message);

      return res.status(200).json({
        message: "Notification sent successfully",
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses.map((r, i) => ({
          token: rider.fcmToken[i],
          success: r.success,
          error: r.error?.message || null,
        })),
      });
    }

    // ✅ Fallback: send individually
    const results = await Promise.all(
      rider.fcmToken.map(async (token) => {
        try {
          await admin.messaging().send({
            token,
            android: message.android,
            data: message.data,
          });
          return { token, success: true };
        } catch (err) {
          return { token, success: false, error: err.message };
        }
      })
    );

    return res.status(200).json({
      message: "Notification sent individually",
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      responses: results,
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
    return res.status(500).json({ message: "Error sending notification" });
  }
};
