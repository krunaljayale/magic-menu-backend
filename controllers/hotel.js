const Owner = require("../models/owner");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../utils/emailSender");
const { default: mongoose } = require("mongoose");
const LiveOrder = require("../models/liveOrder");
const Rider = require("../models/rider");
const admin = require("../config/firebaseAdmin");
const Listing = require("../models/itemListing");
const PastOrder = require("../models/pastOrder");
const RestaurantSettlement = require("../models/restaurantSettlement");
const moment = require("moment-timezone");




module.exports.getOTP = async (req, res) => {
  const { name, email, number } = req.body;

  const existingUser = await Owner.findOne({
    $or: [{ email: email }, { number: number }], // Check for matching email or phone number
  });

  if (existingUser) {
    return res.status(400).json({
      status: "Error",
      message: "User already registered with this email or phone number",
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
    const existingUser = await Owner.findOne({
      $or: [{ email: email }, { number: number }],
    });

    if (existingUser) {
      return res.status(400).json({
        status: "Error",
        message: "User already registered with this email or phone number",
      });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(pass, 10); // Hash with salt rounds = 10

    // Create a new user with hashed password
    const newUser = new Owner({
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
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("Error in registerData:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error",
    });
  }
};

module.exports.loginRoute = async (req, res) => {
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
    const user = await Owner.findOne({ number: number });

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
    const jwt_token = jwt.sign(
      { id: user._id, number: user.number },
      process.env.JWT_SECRET, // Ensure this is stored in an .env file
      { expiresIn: "21d" } // Token valid for 21 days
    );

    // Send token in response
    return res.status(200).json({
      status: "Success",
      message: "User validated successfully",
      token: jwt_token, // Token for frontend authentication
      user_id: user._id, // Send the user_id along with the token
      user_email: user.email,
      user_name: user.name,
      user_no: user.number,
      hotel: user.hotel || "", // Optional field with fallback
      description: user.description || "", // Optional field with fallback
      logo: user.logo?.url || "", // Optional nested field
      isServing: user.isServing || false, // Boolean fallback
      chef: user.chef || { name: "", number: "" }, // Object fallback
    });
  } catch (error) {
    console.error("Error in login:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error. Please try again later.",
    });
  }
};

module.exports.completeProfile = async (req, res) => {
  try {
    const { payload, user_id } = req.body;
    if (!payload || !user_id) {
      return res.status(400).json({ message: "Missing payload or user_id." });
    }

    const { hotel, description, logo, images, chef, location } = payload;

    // Build the $set object for fields that need updating
    const updateFields = {};

    if (hotel !== undefined) updateFields.hotel = hotel;
    if (description !== undefined) updateFields.description = description;
    if (logo && typeof logo === "object") {
      if (logo.url !== undefined) updateFields["logo.url"] = logo.url;
      if (logo.filename !== undefined)
        updateFields["logo.filename"] = logo.filename;
    }
    if (Array.isArray(images)) updateFields.images = images;
    if (chef && typeof chef === "object") {
      if (chef.name !== undefined) updateFields["chef.name"] = chef.name;
      if (chef.number !== undefined)
        updateFields["chef.number"] = Number(chef.number);
    }
    if (location && typeof location === "object") {
      if (location.latitude !== undefined)
        updateFields["location.latitude"] = location.latitude;
      if (location.longitude !== undefined)
        updateFields["location.longitude"] = location.longitude;
      if (location.address !== undefined)
        updateFields["location.address"] = location.address;
    }

    const updatedOwner = await Owner.findByIdAndUpdate(
      user_id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedOwner) {
      return res.status(404).json({ message: "Owner not found." });
    }

    return res.status(200).json({
      message: "Profile updated successfully.",
      owner: updatedOwner,
    });
  } catch (err) {
    console.error("Error in completeProfile:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports.authToken = async (req, res) => {
  try {
    const { user_id } = req.params;

    // Validate user_id format
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await Owner.findById(user_id).select("isServing");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error in authToken:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.toggleDuty = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid or missing owner ID." });
    }

    // Check for active live orders
    const order = await LiveOrder.findOne({ hotel: id, status: "PENDING" });
    if (order) {
      return res.status(403).json({
        message: "Cannot toggle duty while pending orders are in progress.",
      });
    }

    // Toggle isServing status
    const result = await Owner.updateOne({ _id: id }, [
      { $set: { isServing: { $not: "$isServing" } } },
    ]);

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "Owner not found or already in the desired state." });
    }

    return res
      .status(200)
      .json({ message: "Serving status toggled successfully." });
  } catch (e) {
    console.error("Error at toggleDuty API:", e);
    return res.status(500).json({
      message: "An unexpected error occurred. Please try again later.",
    });
  }
};

module.exports.newOrder = async (req, res) => {
  const { hotel_id } = req.body;

  if (!hotel_id) {
    return res.status(400).json({ error: "hotel_id is required" });
  }

  try {
    const orderExists = await LiveOrder.exists({
      hotel: hotel_id,
      status: "PENDING",
    });

    if (orderExists) {
      return res.status(200).json({ newOrder: true });
    } else {
      return res.status(200).json({ newOrder: false });
    }
  } catch (error) {
    console.error("Error checking new orders:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getNewOrders = async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const orders = await LiveOrder.find({
      hotel: user_id,
      status: "PENDING",
    })
      .populate({
        path: "customer",
        select: "name",
      })
      .populate({
        path: "rider",
        select: "name number legal",
      })
      .populate({
        path: "items.item",
        select: "name discountedPrice", // must be space-separated
      })
      .select("ticketNumber items createdAt rider remarks servedAt customer")
      // .sort({ updatedAt: -1 })
      .lean();

    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      customerName: order.customer?.name || "Unknown",
      items: order.items.map((i) => ({
        name: i.item?.name || "Deleted Item",
        quantity: i.quantity,
        price: i.item?.discountedPrice ?? 0, // now `price`
      })),
      createdAt: order.createdAt,
      rider: order.rider
        ? {
            name: order.rider.name,
            number: order.rider.number,
            image: order.rider.legal.passportPhoto.url,
          }
        : {}, // empty object if none
      remarks: order.remarks || "",
      servedAt: order.servedAt,
    }));

    res.status(200).json(formattedOrders);
  } catch (error) {
    console.error("Error in getReadyOrders:", error.message);
    res.status(500).json({ error: "Failed to fetch ready orders" });
  }
};

//For now there is a fixed id given to the user_id
module.exports.getReadyOrders = async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const orders = await LiveOrder.find({
      hotel: user_id,
      restaurantStatus: "READY",
      status: { $in: ["PREPARING", "ACCEPTED"] },
    })
      .populate({
        path: "customer",
        select: "name",
      })
      .populate({
        path: "rider",
        select: "name number legal",
      })
      .populate({
        path: "items.item",
        select: "name discountedPrice", // must be space-separated
      })
      .select("ticketNumber items createdAt rider remarks servedAt customer")
      .sort({ updatedAt: -1 })
      .lean();

    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      customerName: order.customer?.name || "Unknown",
      items: order.items.map((i) => ({
        name: i.item?.name || "Deleted Item",
        quantity: i.quantity,
        price: i.item?.discountedPrice ?? 0, // now `price`
      })),
      updatedAt: order.createdAt,
      rider: order.rider
        ? {
            name: order.rider.name,
            number: order.rider.number,
            image: order.rider.legal.passportPhoto.url,
          }
        : {}, // empty object if none
      remarks: order.remarks || "",
      servedAt: order.servedAt,
    }));

    res.status(200).json(formattedOrders);
  } catch (error) {
    console.error("Error in getReadyOrders:", error.message);
    res.status(500).json({ error: "Failed to fetch ready orders" });
  }
};

module.exports.getPickedUpOrders = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const orders = await LiveOrder.find({
      hotel: user_id,
      status: "PICKEDUP",
    })
      .populate({
        path: "customer",
        select: "name",
      })
      .populate({
        path: "rider",
        select: "name number legal",
      })
      .populate({
        path: "items.item",
        select: "name discountedPrice", // must be space-separated
      })
      .select("ticketNumber items createdAt rider remarks servedAt customer")
      .sort({ updatedAt: -1 })
      .lean();

    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      customerName: order.customer?.name || "Unknown",
      items: order.items.map((i) => ({
        name: i.item?.name || "Deleted Item",
        quantity: i.quantity,
        price: i.item?.discountedPrice ?? 0, // now `price`
      })),
      updatedAt: order.updatedAt,
      rider: {
        name: order.rider.name,
        number: order.rider.number,
        image: order.rider.legal.passportPhoto.url,
      },
      remarks: order.remarks || "",
      servedAt: order.servedAt,
    }));

    res.status(200).json(formattedOrders);
  } catch (error) {
    console.error("Error in getPickedUpOrders:", error.message);
    res.status(500).json({ error: "Failed to fetch picked-up orders" });
  }
};

module.exports.acceptOrder = async (req, res) => {
  try {
    const { order_id, preparationTime } = req.body;

    if (!order_id || !preparationTime) {
      return res
        .status(400)
        .json({ message: "Missing order_id or preparationTime" });
    }

    const order = await LiveOrder.findByIdAndUpdate(
      order_id,
      { preparationTime, status: "PREPARING" },
      { new: true }
    )
      .populate({
        path: "customer",
        select: "name number",
      })
      .populate({
        path: "rider",
        select: "name number legal",
      })
      .populate({
        path: "items.item",
        select: "name discountedPrice",
      })
      .select(
        "ticketNumber items createdAt rider remarks servedAt customer preparationTime"
      )
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const formattedOrder = {
      _id: order._id,
      ticketNumber: order.ticketNumber,
      customerName: order.customer?.name || "Unknown",
      items: order.items.map((i) => ({
        name: i.item?.name || "Deleted Item",
        quantity: i.quantity,
        price: i.item?.discountedPrice ?? 0,
      })),
      createdAt: order.createdAt,
      rider: order.rider
        ? {
            name: order.rider.name,
            number: order.rider.number,
            image: order.rider.legal?.passportPhoto?.url || "",
          }
        : undefined,
      remarks: order.remarks || "",
      servedAt: order.servedAt,
      preparationTime: order.preparationTime,
    };

    res.status(200).json(formattedOrder);
  } catch (error) {
    console.error("Accept Order Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.readyOrder = async (req, res) => {
  const { order_id } = req.body;

  if (!order_id) {
    return res.status(400).json({ error: "order_id is required" });
  }

  try {
    const updatedOrder = await LiveOrder.findByIdAndUpdate(
      order_id,
      { restaurantStatus: "READY" },
      { new: true }
    ).populate("hotel", "hotel");

    if (!updatedOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    const restaurantName = updatedOrder?.hotel?.hotel || "A restaurant";

    let tokenEntries = [];

    if (updatedOrder.rider) {
      // ✅ Rider already assigned — send only to this rider
      const assignedRider = await Rider.findById(updatedOrder.rider);
      if (assignedRider?.fcmToken?.length) {
        tokenEntries = assignedRider.fcmToken.map((token) => ({
          riderId: assignedRider._id,
          token,
        }));
      }
    } else {
      // ✅ No rider assigned — send to all available riders
      const riders = await Rider.find({ onDuty: true, isAvailable: true });
      riders.forEach((r) => {
        (r.fcmToken || []).forEach((t) => {
          tokenEntries.push({ riderId: r._id, token: t });
        });
      });
    }

    const allTokens = tokenEntries.map((e) => e.token);

    let sendRes = { successCount: 0, failureCount: 0, responses: [] };
    if (allTokens.length) {
      const payload = {
        android: {
          notification: {
            sound: "magicmenu_zing_enhanced",
            channelId: "custom-sound-channel",
            title: `✅ ${restaurantName} - Order Ready`,
            body: "Order is prepared and ready for pickup. Head to the restaurant now! 🚗",
          },
        },
      };

      if (typeof admin.messaging().sendMulticast === "function") {
        sendRes = await admin
          .messaging()
          .sendMulticast({ ...payload, tokens: allTokens });
      } else {
        // Fallback
        const results = await Promise.all(
          allTokens.map(async (token) => {
            try {
              await admin.messaging().send({ ...payload, token });
              return { success: true };
            } catch (error) {
              return { success: false, error };
            }
          })
        );
        sendRes = {
          successCount: results.filter((r) => r.success).length,
          failureCount: results.filter((r) => !r.success).length,
          responses: results,
        };
      }

      // ✅ Remove invalid tokens
      const invalidMap = {};
      sendRes.responses.forEach((resp, idx) => {
        if (
          !resp.success &&
          resp.error?.code &&
          [
            "messaging/invalid-registration-token",
            "messaging/registration-token-not-registered",
          ].includes(resp.error.code)
        ) {
          const { riderId, token } = tokenEntries[idx];
          invalidMap[riderId] = invalidMap[riderId] || [];
          invalidMap[riderId].push(token);
        }
      });

      await Promise.all(
        Object.entries(invalidMap).map(([rId, tokens]) =>
          Rider.findByIdAndUpdate(rId, { $pull: { fcmToken: { $in: tokens } } })
        )
      );
    }

    return res.status(200).json({ status: "READY" });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.almostReadyOrder = async (req, res) => {
  const { order_id } = req.body;

  if (!order_id) {
    return res.status(400).json({ error: "order_id is required" });
  }

  try {
    // Check the current order
    const currentOrder = await LiveOrder.findById(order_id).populate("hotel", "hotel");

    if (!currentOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (currentOrder.restaurantStatus === "ALMOST_READY") {
      return res.status(200).json({ message: "Already marked as ALMOST_READY" });
    }

    // Update status to ALMOST_READY
    currentOrder.restaurantStatus = "ALMOST_READY";
    await currentOrder.save();

    const restaurantName = currentOrder.hotel?.hotel || "A restaurant";

    // Get all available riders with valid FCM tokens
    const riders = await Rider.find({ onDuty: true, isAvailable: true });
    const tokenEntries = [];
    riders.forEach((r) => {
      (r.fcmToken || []).forEach((t) => {
        tokenEntries.push({ riderId: r._id, token: t });
      });
    });
    const allTokens = tokenEntries.map((e) => e.token);

    let sendRes = { successCount: 0, failureCount: 0, responses: [] };

    if (allTokens.length) {
      const payload = {
        android: {
          notification: {
            sound: "magicmenu_zing_enhanced",
            channelId: "custom-sound-channel",
            title: `⏳ ${restaurantName} - Order Almost Ready`,
            body: "The order will be ready in 5 minutes. Get prepared to pick it up! 🚀",
          },
        },
      };

      if (typeof admin.messaging().sendMulticast === "function") {
        sendRes = await admin.messaging().sendMulticast({ ...payload, tokens: allTokens });
      } else {
        // Fallback for older SDKs: send one-by-one
        const results = await Promise.all(
          allTokens.map(async (token) => {
            try {
              await admin.messaging().send({ ...payload, token });
              return { success: true };
            } catch (error) {
              return { success: false, error };
            }
          })
        );
        sendRes = {
          successCount: results.filter((r) => r.success).length,
          failureCount: results.filter((r) => !r.success).length,
          responses: results,
        };
      }

      // Remove invalid FCM tokens
      const invalidMap = {};
      sendRes.responses.forEach((resp, idx) => {
        if (
          !resp.success &&
          resp.error?.code &&
          [
            "messaging/invalid-registration-token",
            "messaging/registration-token-not-registered",
          ].includes(resp.error.code)
        ) {
          const { riderId, token } = tokenEntries[idx];
          invalidMap[riderId] = invalidMap[riderId] || [];
          invalidMap[riderId].push(token);
        }
      });

      await Promise.all(
        Object.entries(invalidMap).map(([rId, tokens]) =>
          Rider.findByIdAndUpdate(rId, { $pull: { fcmToken: { $in: tokens } } })
        )
      );
    }

    return res.status(200).json({ status: "ALMOST_READY", notificationSent: sendRes.successCount });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Menu routes controllers
module.exports.getRestaurantData = async (req, res) => {
  try {
    const { user_id } = req.params;

    const restaurant = await Owner.findById(user_id).select(
      "hotel description isVeg logo"
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json(restaurant);
  } catch (error) {
    console.error(
      "Error fetching restaurant data from getRestaurantData: ",
      error
    );
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getRestaurantCategories = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const owner = await Owner.findById(user_id).select("categories");

    if (!owner) {
      return res.status(404).json({ error: "Owner not found" });
    }

    res.status(200).json({ categories: owner.categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports.getCategoriesItems = async (req, res) => {
  try {
    const { user_id, category } = req.params;

    if (!user_id || !category) {
      return res
        .status(400)
        .json({ message: "User ID and category are required." });
    }

    const items = await Listing.find({ owner: user_id, category });

    res.status(200).json(items);
  } catch (error) {
    console.error("Error fetching category items:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch items. Try again later." });
  }
};

module.exports.changeListingStockStatus = async (req, res) => {
  try {
    const { item_id } = req.params;
    const item = await Listing.findById(item_id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    item.inStock = !item.inStock;
    await item.save();

    res
      .status(200)
      .json({ message: "Stock status updated", inStock: item.inStock });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.changeListingRecommendStatus = async (req, res) => {
  try {
    const { item_id } = req.params;
    const item = await Listing.findById(item_id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    item.isRecommended = !item.isRecommended;
    await item.save();

    res.status(200).json({
      message: "Stock status updated",
      isRecommended: item.isRecommended,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.addListing = async (req, res) => {
  try {
    const { user_id } = req.params;
    const payload = req.body;

    // Validate user_id
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Validate required payload fields (excluding imageUrl to allow dummy)
    const requiredFields = [
      "name",
      "description",
      "originalPrice",
      "discountedPrice",
      "category",
      "isVeg",
    ];

    for (let field of requiredFields) {
      if (!payload[field]) {
        return res
          .status(400)
          .json({ message: `Missing required field: ${field}` });
      }
    }

    // Prepare images array
    const images = payload.imageUrl
      ? [
          {
            url: payload.imageUrl,
            filename: payload.imageUrl.split("/").pop(),
          },
        ]
      : undefined; // Let schema use the default dummy image

    // Construct new listing
    const newListing = new Listing({
      name: payload.name,
      originalPrice: payload.originalPrice,
      discountedPrice: payload.discountedPrice,
      description: payload.description,
      images, // use undefined if not provided
      isVeg: payload.isVeg,
      inStock: false,
      isRecommended: false,
      category: payload.category,
      owner: user_id,
    });

    await newListing.save();

    return res.status(201).json({
      message: "Listing created successfully",
    });
  } catch (error) {
    console.error("Add Listing Error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

module.exports.updateListing = async (req, res) => {
  try {
    const { user_id, item_id } = req.params;
    const payload = req.body;

    // 🔒 Validate MongoDB ObjectIDs
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(item_id)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }

    // ❌ Block update if item is part of a live order for this hotel
    const liveOrderExists = await LiveOrder.findOne({
      hotel: user_id,
      "items.item": item_id,
    });
    if (liveOrderExists) {
      return res.status(400).json({
        message: "Cannot update listing while it is part of a live order.",
      });
    }

    // 🧾 Validate required fields
    const requiredFields = [
      "name",
      "description",
      "originalPrice",
      "discountedPrice",
      "isVeg",
    ];
    for (let field of requiredFields) {
      if (payload[field] === undefined || payload[field] === null) {
        return res
          .status(400)
          .json({ message: `Missing required field: ${field}` });
      }
    }

    // 🛠️ Prepare update object
    const updateData = {
      name: payload.name.trim(),
      description: payload.description?.trim() || "",
      originalPrice: Number(payload.originalPrice),
      discountedPrice: Number(payload.discountedPrice),
      isVeg: Boolean(payload.isVeg),
    };

    // 🖼️ Handle image update
    if (payload.imageUrl) {
      updateData.images = [
        {
          url: payload.imageUrl,
          filename: payload.imageUrl.split("/").pop(),
        },
      ];
    }

    // 🧩 Handle optional addOns
    if (Array.isArray(payload.addOns)) {
      const validAddOns = payload.addOns.filter(
        (a) =>
          a &&
          mongoose.Types.ObjectId.isValid(a._id) &&
          typeof a.name === "string" &&
          a.name.trim() !== ""
      );
      updateData.addOns = validAddOns;
    }

    // 🧾 Update the listing
    const updatedListing = await Listing.findOneAndUpdate(
      { _id: item_id, owner: user_id },
      { $set: updateData },
      { new: true }
    );

    if (!updatedListing) {
      return res
        .status(404)
        .json({ message: "Listing not found or not owned by user" });
    }

    return res.status(200).json({
      message: "Listing updated successfully",
      listing: updatedListing, // helpful for frontend
    });
  } catch (error) {
    console.error("Update Listing Error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

module.exports.addCategory = async (req, res) => {
  const { user_id } = req.params;
  const category = req.body;

  try {
    const hotel = await Owner.findById(user_id);
    if (!hotel) return res.status(404).json({ message: "Hotel not found" });

    if (!Array.isArray(hotel.categories)) {
      hotel.categories = [];
    }

    hotel.categories.push(category.name); // ✅ Fix is here

    await hotel.save();
    res.status(200).json({ message: "Category added successfully" });
  } catch (error) {
    console.error("Add Category Error:", error);
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

module.exports.updateCategory = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { oldCategory, newCategory } = req.body;

    if (!oldCategory || !newCategory) {
      return res
        .status(400)
        .json({ message: "Both old and new category names are required." });
    }

    const owner = await Owner.findById(user_id);
    if (!owner) {
      return res.status(404).json({ message: "Owner not found." });
    }

    // Find old category index (trimmed for safety, but store exactly as typed)
    const categoryIndex = owner.categories.findIndex(
      (cat) => cat.trim() === oldCategory.trim()
    );

    if (categoryIndex === -1) {
      return res.status(404).json({ message: "Old category not found." });
    }

    // Check for duplicates (also trimmed)
    const isDuplicate = owner.categories.some(
      (cat) => cat.trim() === newCategory.trim()
    );

    if (isDuplicate) {
      return res.status(400).json({ message: "New category already exists." });
    }

    // Update owner's category
    owner.categories[categoryIndex] = newCategory;
    await owner.save();

    // ✅ Update all listings with the old category
    const updateResult = await Listing.updateMany(
      { owner: user_id, category: oldCategory },
      { $set: { category: newCategory } }
    );

    return res.status(200).json({
      message: "Category updated successfully.",
      listingsUpdated: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error("Update Category Error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

module.exports.deleteCategory = async (req, res) => {
  const { user_id } = req.params;
  const { category } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Step 1: Remove category from Owner's list
    const owner = await Owner.findByIdAndUpdate(
      user_id,
      { $pull: { categories: category } },
      { new: true, session }
    );
    if (!owner) {
      throw new Error("Owner not found");
    }

    // Step 2: Delete listings under this category
    await Listing.deleteMany({ owner: user_id, category }, { session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    return res
      .status(200)
      .json({ message: "Category and listings deleted successfully" });
  } catch (error) {
    // Abort transaction on any error
    await session.abortTransaction();
    session.endSession();
    console.error("Delete Category Transaction Failed:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

module.exports.getAddOnCategoriesItems = async (req, res) => {
  try {
    const { user_id, category } = req.params;

    if (!user_id || !category) {
      return res
        .status(400)
        .json({ message: "User ID and category are required." });
    }

    const items = await Listing.find({ owner: user_id, category }).select(
      "name _id"
    );

    res.status(200).json(items);
  } catch (error) {
    console.error("Error fetching category items:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch items. Try again later." });
  }
};

module.exports.changeCategoryStatus = async (req, res) => {
  const { user_id } = req.params;
  const { category } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Step 1: Update listings under this category to inStock: false
    await Listing.updateMany(
      { owner: user_id, category },
      { $set: { inStock: false } },
      { session }
    );

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    return res
      .status(200)
      .json({ message: "Category and listings updated successfully" });
  } catch (error) {
    // Abort transaction on any error
    await session.abortTransaction();
    session.endSession();
    console.error("Update Category Transaction Failed:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

module.exports.getRestaurantProfile = async (req, res) => {
  try {
    const { user_id } = req.params;

    const restaurant = await Owner.findById(user_id).select(
      "name email number hotel description chef isVeg logo"
    );

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.status(200).json(restaurant);
  } catch (error) {
    console.error(
      "Error fetching restaurant data from getRestaurantData: ",
      error
    );
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.updateRestaurantProfile = async (req, res) => {
  try {
    const { user_id } = req.params;

    // Get the updated data from request body
    const { name, email, number, hotel, description, chef, isVeg, logo } =
      req.body;

    // Find the restaurant owner by ID
    const restaurant = await Owner.findById(user_id);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Update the restaurant profile fields
    if (name) restaurant.name = name;
    if (email) restaurant.email = email;
    if (number) restaurant.number = number;
    if (hotel) restaurant.hotel = hotel;
    if (description) restaurant.description = description;
    if (typeof isVeg === "boolean") restaurant.isVeg = isVeg;
    if (logo && logo.url) restaurant.logo = logo;
    if (chef?.name || chef?.number) {
      restaurant.chef = {
        name: chef.name || restaurant.chef?.name || "",
        number: chef.number || restaurant.chef?.number || null,
      };
    }

    await restaurant.save();

    res
      .status(200)
      .json({ message: "Restaurant profile updated successfully" });
  } catch (error) {
    console.error("Error updating restaurant profile:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.getBusinessReport = async (req, res) => {
  const { user_id } = req.params;

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";

    // IST-based day boundaries (no utc())
    const todayStart = moment().tz(TIMEZONE).startOf("day").toDate();
    const todayEnd = moment().tz(TIMEZONE).endOf("day").toDate();

    const yesterdayStart = moment()
      .tz(TIMEZONE)
      .subtract(1, "day")
      .startOf("day")
      .toDate();
    const yesterdayEnd = moment()
      .tz(TIMEZONE)
      .subtract(1, "day")
      .endOf("day")
      .toDate();

    // Revenue calculator
    const calculateRevenue = async (startDate, endDate) => {
      const result = await PastOrder.aggregate([
        {
          $match: {
            hotel: hotelObjectId,
            status: "DELIVERED",
            deliveredAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "listings",
            localField: "items.listingId",
            foreignField: "_id",
            as: "itemData",
          },
        },
        { $unwind: "$itemData" },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $multiply: ["$items.quantity", "$itemData.discountedPrice"],
              },
            },
          },
        },
      ]);

      return result[0]?.totalRevenue || 0;
    };

    const todaySales = await calculateRevenue(todayStart, todayEnd);
    const yesterdaySales = await calculateRevenue(yesterdayStart, yesterdayEnd);

    return res.status(200).json({
      todaySales,
      yesterdaySales,
    });
  } catch (error) {
    console.error("Error in getBusinessReport:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getOrderSummary = async (req, res) => {
  const { user_id } = req.params;

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";

    const startOfToday = moment().tz(TIMEZONE).startOf("day").toDate();
    const endOfToday = moment().tz(TIMEZONE).endOf("day").toDate();

    // Delivered orders from PastOrder using deliveredAt
    const deliveredCount = await PastOrder.countDocuments({
      hotel: hotelObjectId,
      status: "DELIVERED",
      deliveredAt: { $gte: startOfToday, $lte: endOfToday },
    });

    // Pending orders from LiveOrder using createdAt
    const pendingCount = await LiveOrder.countDocuments({
      hotel: hotelObjectId,
      createdAt: { $gte: startOfToday, $lte: endOfToday },
    });

    const totalOrders = deliveredCount + pendingCount;

    return res.status(200).json({
      totalOrders,
      delivered: deliveredCount,
      pending: pendingCount,
    });
  } catch (error) {
    console.error("Error fetching order summary:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getTopSellingItems = async (req, res) => {
  const { user_id } = req.params;

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";

    const startOfToday = moment().tz(TIMEZONE).startOf("day").toDate();
    const endOfToday = moment().tz(TIMEZONE).endOf("day").toDate();

    const result = await PastOrder.aggregate([
      {
        $match: {
          hotel: hotelObjectId,
          status: "DELIVERED",
          deliveredAt: { $gte: startOfToday, $lte: endOfToday },
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "listings",
          localField: "items.listingId", // ✅ fixed field
          foreignField: "_id",
          as: "itemData",
        },
      },
      { $unwind: "$itemData" },
      {
        $group: {
          _id: "$itemData.name",
          quantity: { $sum: "$items.quantity" },
          revenue: {
            $sum: {
              $multiply: ["$items.quantity", "$itemData.discountedPrice"],
            },
          },
        },
      },
      {
        $project: {
          name: "$_id",
          quantity: 1,
          revenue: 1,
          _id: 0,
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
    ]);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting top selling items:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getTodayOrders = async (req, res) => {
  const { user_id } = req.params;

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";

    const startOfToday = moment().tz(TIMEZONE).startOf("day").toDate();
    const endOfToday = moment().tz(TIMEZONE).endOf("day").toDate();

    const data = await PastOrder.find({
      hotel: hotelObjectId,
      orderedAt: { $gte: startOfToday, $lte: endOfToday },
    })
      .populate({
        path: "payment",
        select: "transactionId status amount createdAt",
      })
      .sort({ orderedAt: -1 });

    const formattedData = data.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      orderOtp: order.orderOtp,
      status: order.status,
      customer: order.customer,
      payment: order.payment,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      orderedAt: order.orderedAt,
      deliveredAt: order.deliveredAt,
      totalPrice: order.totalPrice,
      // hotel is intentionally excluded
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error fetching today's orders:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getYesterdayOrders = async (req, res) => {
  const { user_id } = req.params;

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";

    const endOfYesterday = moment().tz(TIMEZONE).startOf("day").toDate(); // Today 00:00
    const startOfYesterday = moment(endOfYesterday).subtract(1, "day").toDate(); // Yesterday 00:00

    const data = await PastOrder.find({
      hotel: hotelObjectId,
      orderedAt: { $gte: startOfYesterday, $lt: endOfYesterday },
    })
      .populate({
        path: "payment",
        select: "transactionId status amount createdAt",
      })
      .sort({ orderedAt: -1 });

    const formattedData = data.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      orderOtp: order.orderOtp,
      status: order.status,
      customer: order.customer,
      payment: order.payment,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      orderedAt: order.orderedAt,
      deliveredAt: order.deliveredAt,
      totalPrice: order.totalPrice,
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error fetching yesterday's orders:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getRunningWeekOrders = async (req, res) => {
  const { user_id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(user_id)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";
    const now = moment.tz(TIMEZONE);

    // Calculate current running week: Thursday (start) to Wednesday (end)
    const currentDay = now.day(); // 0 = Sunday
    const daysSinceThursday = (currentDay + 3) % 7;
    const weekStart = now
      .clone()
      .subtract(daysSinceThursday, "days")
      .startOf("day");
    const weekEnd = weekStart.clone().add(6, "days").endOf("day");

    // Fetch orders within this range
    const data = await PastOrder.find({
      hotel: hotelObjectId,
      orderedAt: { $gte: weekStart.toDate(), $lte: weekEnd.toDate() },
    })
      .populate({
        path: "payment",
        select: "transactionId status amount createdAt",
      })
      .sort({ orderedAt: -1 });

    const formattedData = data.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      orderOtp: order.orderOtp,
      status: order.status,
      customer: order.customer,
      payment: order.payment,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      orderedAt: order.orderedAt,
      deliveredAt: order.deliveredAt,
      totalPrice: order.totalPrice,
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error fetching running week orders:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getCustomOrders = async (req, res) => {
  const { user_id } = req.params;
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Start and end date required" });
  }

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";

    // Convert incoming dates to timezone-aware moments
    const start = moment.tz(startDate, TIMEZONE).startOf("day").toDate();
    const end = moment.tz(endDate, TIMEZONE).endOf("day").toDate();

    const data = await PastOrder.find({
      hotel: hotelObjectId,
      orderedAt: { $gte: start, $lte: end },
    })
      .populate({
        path: "payment",
        select: "transactionId status amount createdAt",
      })
      .sort({ orderedAt: -1 });

    const formattedData = data.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      orderOtp: order.orderOtp,
      status: order.status,
      customer: order.customer,
      payment: order.payment,
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      orderedAt: order.orderedAt,
      deliveredAt: order.deliveredAt,
      totalPrice: order.totalPrice,
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error fetching custom range orders:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getWeeklyRevenueReport = async (req, res) => {
  const { user_id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(user_id)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    const hotelObjectId = new mongoose.Types.ObjectId(user_id);
    const TIMEZONE = "Asia/Kolkata";
    const now = moment.tz(TIMEZONE);

    // ✅ Calculate last Thursday 12:00 AM
    const currentDay = now.day(); // 0 = Sunday
    const daysSinceThursday = (currentDay + 3) % 7; // Distance from Thursday
    const weekStart = now
      .clone()
      .subtract(daysSinceThursday, "days")
      .startOf("day");

    // ✅ Calculate Wednesday 11:59:59 PM (end of the 7-day window)
    const weekEnd = weekStart.clone().add(6, "days").endOf("day");

    // ✅ Fetch all delivered orders in that window
    const orders = await PastOrder.find({
      hotel: hotelObjectId,
      status: "DELIVERED",
      orderedAt: {
        $gte: weekStart.toDate(),
        $lte: weekEnd.toDate(),
      },
    });

    // ✅ Calculate gross revenue
    let grossRevenue = 0;
    orders.forEach((order) => {
      order.items.forEach((item) => {
        grossRevenue += item.price * item.quantity;
      });
    });

    const totalOrders = orders.length;

    // ✅ Calculate commission and tax
    const commissionRate = 0.2; // 20%
    const gstRate = 0.18; // 18% on commission

    const commissionAmount = parseFloat(
      (grossRevenue * commissionRate).toFixed(2)
    );
    const taxOnCommission = parseFloat((commissionAmount * gstRate).toFixed(2));
    const netRevenue = parseFloat(
      (grossRevenue - commissionAmount - taxOnCommission).toFixed(2)
    );

    return res.status(200).json({
      restaurantId: user_id,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalOrders,
      grossRevenue: parseFloat(grossRevenue.toFixed(2)),
      commissionRate: 20,
      commissionAmount,
      taxOnCommission,
      netRevenue,
    });
  } catch (error) {
    console.error("Error generating weekly revenue report:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.getWeeklyPayoutsReport = async (req, res) => {
  try {
    const hotelId = req.params.hotelId || req.user?.id; // Adjust based on how auth middleware works

    if (!hotelId) {
      return res.status(400).json({ message: "Missing hotel ID" });
    }

    const settlements = await RestaurantSettlement.find({ hotel: hotelId })
      .sort({ weekStart: -1 }); // Most recent first

    return res.status(200).json({ settlements });
  } catch (error) {
    console.error("❌ Error fetching weekly revenue report:", error.message);
    return res.status(500).json({ message: "Failed to fetch weekly report" });
  }
};