const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Owner = require("../models/owner");
const { default: mongoose, set } = require("mongoose");
const Listing = require("../models/itemListing");
const LiveOrder = require("../models/liveOrder");
const Customer = require("../models/customer");
const Category = require("../models/category");
const PastOrder = require("../models/pastOrder");
const PaymentLog = require("../models/paymentLog");
const Rider = require("../models/rider");
const EmailOtp = require("../models/emailOTP");
const GlobalAlert = require("../models/globalAlert");
const { sendEmail } = require("../utils/emailSender");
const {
  generateTransactionID,
  generateTicket,
} = require("../utils/paymentUtils");
const { calculateDistance } = require("../utils/mapUtils");
// const { initiatePayment } = require("../utils/paymentHandler");
const turf = require("@turf/turf");
const { serviceAreas } = require("../utils/serviceAreas");
const admin = require("../config/firebaseAdmin");

module.exports.data = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { location } = req.body;

    const customer = await Customer.findById(user_id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const defaultLoc = Array.isArray(customer.location)
      ? customer.location.find((loc) => loc.isDefault)
      : null;

    // 🧠 Helper to match location with buffered service areas
    const getMatchingServiceArea = (lat, lon) => {
      const point = turf.point([lon, lat]); // [lon, lat]
      return serviceAreas.find((area) => {
        const rawPolygon = turf.polygon([area.polygon[0]]);
        const bufferedPolygon = turf.buffer(rawPolygon, 0.3, {
          units: "kilometers",
        });
        return turf.booleanPointInPolygon(point, bufferedPolygon);
      });
    };

    let selectedCoords = null;
    let matchedArea = null;

    // ✅ 1. Try location.coords first
    if (location?.coords?.latitude && location?.coords?.longitude) {
      const lat = location.coords.latitude;
      const lon = location.coords.longitude;

      const area = getMatchingServiceArea(lat, lon);
      if (area) {
        selectedCoords = { latitude: lat, longitude: lon };
        matchedArea = area;
      }
    }

    // ✅ 2. Fallback to default location
    if (!matchedArea && defaultLoc?.latitude && defaultLoc?.longitude) {
      const area = getMatchingServiceArea(
        defaultLoc.latitude,
        defaultLoc.longitude
      );
      if (area) {
        selectedCoords = defaultLoc;
        matchedArea = area;
      }
    }

    // ✅ 3. If still not inside any area, reject
    if (!selectedCoords || !matchedArea) {
      return res.status(403).json({
        error: "You're outside our service area",
        code: "OUT_OF_SERVICE_AREA",
      });
    }

    const { latitude: custLat, longitude: custLon } = selectedCoords;

    // Use non-buffered polygon for hotel filtering (precise delivery zone)
    const polygon = turf.polygon([matchedArea.polygon[0]]);

    // ✅ 4. Filter owners inside the matched polygon
    const owners = await Owner.find();
    const filteredOwners = owners.filter((owner) => {
      const { latitude, longitude } = owner?.location || {};
      if (!latitude || !longitude) return false;

      const point = turf.point([longitude, latitude]);
      return turf.booleanPointInPolygon(point, polygon);
    });

    // ✅ 5. Enrich owners with distance and ETA
    const enrichedOwners = filteredOwners.map((ownerDoc) => {
      const owner = ownerDoc.toObject();
      const { latitude: ownLat, longitude: ownLon } = owner.location;

      const distanceKm = calculateDistance(custLat, custLon, ownLat, ownLon);
      const travelTimeMin = (distanceKm / 25) * 60;
      const rawDeliveryTime = travelTimeMin + 10;

      // ✅ Enforce minimum display values
      const safeDistanceKm = distanceKm.toFixed(2);
      const safeDeliveryTimeMin = Math.max(10, Math.round(rawDeliveryTime));

      return {
        ...owner,
        distanceKm: safeDistanceKm,
        deliveryTimeMin: safeDeliveryTimeMin,
      };
    });

    return res.status(200).json(enrichedOwners);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports.checkAlert = async (req, res) => {
  try {
    const data = await GlobalAlert.findOne();

    if (!data || !data.isActive) {
      return res.status(404).json({ message: "No alert at this moment" });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching alert:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

module.exports.hotelData = async (req, res) => {
  try {
    const { id, _id } = req.params;

    // Fetching customer default location and hotel data in parallel for speed
    const [customerData, hotelData] = await Promise.all([
      Customer.findById(_id, "location").lean(),
      Owner.findById(id, "-password -__v").lean(),
    ]);

    if (!customerData || !hotelData) {
      return res
        .status(404)
        .send({ error: "Customer or Hotel data not found." });
    }

    // Extracting default location
    const defaultLocation = customerData.location?.find(
      (loc) => loc.isDefault === true
    );
    if (!defaultLocation) {
      return res.status(200).send(hotelData);
    }

    // Calculating distance and estimated time
    const { latitude: lat1, longitude: lon1 } = defaultLocation;
    const { latitude: lat2, longitude: lon2 } = hotelData.location;

    const averageSpeed = 25; // km/h
    const rawDistance = calculateDistance(lat1, lon1, lat2, lon2); // float km
    const rawTime = (rawDistance / averageSpeed) * 60 + 10; // float min

    // ✅ Store raw (if needed)
    hotelData.rawDistance = +rawDistance.toFixed(2);
    hotelData.rawEstimatedTime = +rawTime.toFixed(2);

    // ✅ Display values (always ≥ 1 km and 10 min)
    hotelData.distance = rawDistance.toFixed(2);
    hotelData.estimatedTime = Math.max(10, Math.round(rawTime));

    res.send(hotelData);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};

module.exports.listingData = async (req, res) => {
  let { id, category } = req.params;
  let data = await Listing.find({
    owner: id,
    category: category,
    inStock: true,
  });
  return res.send(data);
};

module.exports.getAddOns = async (req, res) => {
  const { itemIds } = req.body;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res
      .status(400)
      .json({ message: "itemIds must be a non-empty array" });
  }

  try {
    // Step 1: Get addOn IDs from given listings
    const items = await Listing.find({ _id: { $in: itemIds } }, "addOns");

    const allAddOnIds = items.flatMap(
      (item) => item.addOns?.map((addOn) => addOn._id.toString()) || []
    );

    const uniqueAddOnIds = [...new Set(allAddOnIds)];

    // Step 2: Fetch only in-stock add-ons with selected fields
    const addOns = await Listing.find({
      _id: { $in: uniqueAddOnIds },
      inStock: true,
    }).select(
      "_id name description category discountedPrice originalPrice images owner isVeg"
    );

    res.status(200).json({ addOns });
  } catch (error) {
    console.error("Error fetching add-ons:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports.getOTP = async (req, res) => {
  const { name, email, number } = req.body;

  try {
    // 1. Check if user already exists
    const existingUser = await Customer.findOne({
      $or: [{ email }, { number }],
    });

    if (existingUser) {
      return res.status(400).json({
        status: "Error",
        message: "User already registered with this email or phone number",
      });
    }

    // 2. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Try to send OTP email first
    const emailResponse = await sendEmail(name, email, otp);

    if (emailResponse.status !== 200) {
      return res.status(500).json({
        status: "Error",
        message: "Failed to send OTP email",
      });
    }

    // 4. Only after successful email send, store OTP in DB
    await EmailOtp.findOneAndUpdate(
      { email },
      { number, otp, createdAt: new Date() },
      { upsert: true }
    );

    return res.status(200).json({
      status: "Success",
      message: "OTP sent to email successfully",
    });
  } catch (err) {
    console.error("Error in getOTP:", err);
    return res.status(500).json({
      status: "Error",
      message: "Something went wrong",
    });
  }
};

module.exports.registerData = async (req, res) => {
  const { name, number, email, pass, otp } = req.body;

  // 1. Check for missing fields
  if (!name || !number || !email || !pass || !otp) {
    return res
      .status(400)
      .json({ status: "Error", message: "Missing required fields" });
  }

  try {
    // 2. Fetch OTP record
    const otpRecord = await EmailOtp.findOne({ email });

    if (!otpRecord) {
      return res.status(400).json({
        status: "Error",
        message: "OTP expired or not requested",
      });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({
        status: "Error",
        message: "Invalid OTP",
      });
    }

    // ✅ OTP verified, now delete the OTP record
    await EmailOtp.deleteOne({ email });

    // 3. Check if user already exists
    const existingUser = await Customer.findOne({
      $or: [{ email }, { number }],
    });

    if (existingUser) {
      return res.status(400).json({
        status: "Error",
        message: "User already registered with this email or phone number",
      });
    }

    // 4. Hash password
    const hashedPassword = await bcrypt.hash(pass, 10);

    // 5. Save new user
    const newUser = new Customer({
      name,
      email,
      number,
      password: hashedPassword,
    });

    await newUser.save();

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
    const user = await Customer.findOne({ number: number });

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
      { expiresIn: "21d" } // Token valid for 7 days
    );

    // Send token in response
    return res.status(200).json({
      status: "Success",
      message: "User validated successfully",
      token: token, // Token for frontend authentication
      user_id: user._id, // Send the user_id along with the token
    });
  } catch (error) {
    console.error("Error in login:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error. Please try again later.",
    });
  }
};

module.exports.profile = async (req, res) => {
  let { id } = req.params;
  let data = await Customer.findById(id).select(
    "name number email notificationsEnabled"
  );
  res.send(data);
};

module.exports.toggleNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Flip the existing value
    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      { notificationsEnabled: !customer.notificationsEnabled },
      { new: true }
    );

    res.status(200).json({
      message: "Notification preference updated",
      notificationsEnabled: updatedCustomer.notificationsEnabled,
    });
  } catch (err) {
    console.error("Error toggling notifications:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports.registerFCM = async (req, res) => {
  const { id } = req.params;
  const { token } = req.body;

  try {
    const customer = await Customer.findById(id);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Ensure fcmToken is initialized
    if (!Array.isArray(customer.fcmToken)) {
      customer.fcmToken = [];
    }

    // Add token only if it doesn't already exist
    if (!customer.fcmToken.includes(token)) {
      customer.fcmToken.push(token);
      await customer.save();
    }

    return res.status(200).json({ message: "FCM Token saved successfully" });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports.categorySuggestion = async (req, res) => {
  const { category } = req.params;
  let data = await Category.find({
    name: { $regex: category, $options: "i" },
  }).limit(5);
  res.send(data);
};

module.exports.categoryRestaurant = async (req, res) => {
  const { user_id, category } = req.params;

  try {
    const customer = await Customer.findById(user_id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const defaultLoc = Array.isArray(customer.location)
      ? customer.location.find((loc) => loc.isDefault)
      : null;

    if (!defaultLoc) {
      return res.status(400).json({ error: "Default location not set" });
    }

    const userPoint = turf.point([defaultLoc.longitude, defaultLoc.latitude]);

    // Check if user's location is within any service area
    const matchedArea = serviceAreas.find((area) =>
      turf.booleanPointInPolygon(userPoint, turf.polygon(area.polygon))
    );

    if (!matchedArea) {
      return res.status(403).json({ error: "Location not in a servable area" });
    }

    // Proceed if location is valid
    const data = await Listing.aggregate([
      {
        $match: { category: category },
      },
      {
        $group: {
          _id: "$owner",
        },
      },
      {
        $lookup: {
          from: "owners",
          localField: "_id",
          foreignField: "_id",
          as: "owner",
        },
      },
      {
        $unwind: "$owner",
      },
    ]);

    // (Optional) Filter owners whose own location is also inside that area
    const filtered = data.filter((item) => {
      const loc = turf.point([
        item.owner.location.longitude,
        item.owner.location.latitude,
      ]);
      return turf.booleanPointInPolygon(loc, turf.polygon(matchedArea.polygon));
    });

    res.send(filtered); // or `res.send(filtered)` if filtering by owner location
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error fetching data" });
  }
};

module.exports.updateAddress = async (req, res) => {
  const {
    _id,
    addressId,
    title,
    location,
    houseNo,
    buildingNo,
    landmark,
    isDefault,
  } = req.body;

  try {
    const existingUser = await Customer.findById(_id);
    if (!existingUser) {
      return res.status(404).json({
        status: "Error",
        message: "User not found",
      });
    }
    const order = await LiveOrder.findOne({ customer: _id });
    if (order) {
      return res.status(400).json({
        status: "Error",
        message:
          "Address update is disabled while an order is in progress. Please wait until the current order is delivered.",
      });
    }

    const addressIndex = existingUser.location.findIndex(
      (addr) => addr._id.toString() === addressId
    );
    if (addressIndex === -1) {
      return res.status(404).json({
        status: "Error",
        message: "Address not found",
      });
    }

    // Update only the required fields
    existingUser.location[addressIndex] = {
      ...existingUser.location[addressIndex],
      title,
      latitude: location.latitude,
      longitude: location.longitude,
      houseNo,
      buildingNo,
      landmark,
      isDefault: existingUser.location[addressIndex].isDefault,
    };

    await existingUser.save();

    return res.status(200).json({
      status: "Success",
      message: "Address updated successfully",
    });
  } catch (error) {
    console.error("Error updating address:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error",
    });
  }
};

module.exports.allAddress = async (req, res) => {
  let { id } = req.params;
  let data = await Customer.findById(id, { location: 1 });
  res.send(data.location);
};

module.exports.updateDefault = async (req, res) => {
  let { id, addressId } = req.params; // Ensure addressId is extracted
  try {
    const existingUser = await Customer.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        status: "Error",
        message: "User not found",
      });
    }

    const addressIndex = existingUser.location.findIndex(
      (addr) => addr._id.toString() === addressId
    );

    if (addressIndex === -1) {
      return res.status(404).json({
        status: "Error",
        message: "Address not found",
      });
    }

    // Reset all addresses to isDefault: false
    existingUser.location.forEach((addr) => (addr.isDefault = false));

    // Set the selected address as default
    existingUser.location[addressIndex].isDefault = true;

    await existingUser.save();

    return res.status(200).json({
      status: "Success",
      message: "Default address updated successfully",
    });
  } catch (error) {
    console.error("Error updating default address:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error",
    });
  }
};

module.exports.deleteAddress = async (req, res) => {
  let { id, addressId } = req.params; // Ensure addressId is extracted
  try {
    const existingUser = await Customer.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        status: "Error",
        message: "User not found",
      });
    }

    // Block deletion if a live order exists
    const liveOrder = await LiveOrder.findOne({ customer: id });
    if (liveOrder) {
      return res.status(400).json({
        status: "Error",
        message: "Address cannot be deleted while an order is in progress.",
      });
    }

    const addressIndex = existingUser.location.findIndex(
      (addr) => addr._id.toString() === addressId
    );

    if (addressIndex === -1) {
      return res.status(404).json({
        status: "Error",
        message: "Address not found",
      });
    }

    // Remove the address from the array
    existingUser.location.splice(addressIndex, 1);

    // If the deleted address was the default, set another one as default
    if (
      existingUser.location.length > 0 &&
      !existingUser.location.some((addr) => addr.isDefault)
    ) {
      existingUser.location[0].isDefault = true;
    }

    await existingUser.save();

    return res.status(200).json({
      status: "Success",
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error",
    });
  }
};

module.exports.addAddress = async (req, res) => {
  const { _id, title, location, houseNo, buildingNo, landmark, isDefault } =
    req.body;
  let latitude = location.latitude;
  let longitude = location.longitude;
  try {
    const existingUser = await Customer.findById(_id);
    if (!existingUser) {
      return res.status(404).json({
        status: "Error",
        message: "User not found",
      });
    }
    existingUser.location.push({
      title,
      latitude,
      longitude,
      houseNo,
      buildingNo,
      landmark,
      isDefault,
    });
    await existingUser.save();
    return res.status(200).json({
      status: "Success",
      message: "Address added successfully",
    });
  } catch (error) {
    console.error("Error in saving address:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error",
    });
  }
};

// Live-Order Route
module.exports.liveOrder = async (req, res) => {
  try {
    const { id, orderId } = req.params;

    if (!id || !orderId) {
      return res
        .status(400)
        .json({ error: "Customer ID and Order ID are required" });
    }

    const order = await LiveOrder.findOne({
      customer: id,
      _id: orderId,
    })
      .populate({
        path: "customer",
        select: "-password",
      })
      .populate({
        path: "payment", // Send this directly as-is
        select: "amount mode status", // You can add "transactionId" or others if needed
      });

    if (!order) {
      return res.status(404).json({ message: "Live order not found." });
    }

    const hotelLocation = await Owner.findById(order.hotel);
    const { latitude: lat1, longitude: lon1 } = hotelLocation.location;
    const { latitude: lat2, longitude: lon2 } =
      order.customer.location[order.locationIndex];

    const distance = calculateDistance(lat1, lon1, lat2, lon2).toFixed(2);
    const estimatedDeliveryTime = (
      (distance / 25) * 60 +
      order.preparationTime
    ).toFixed(2); // in minutes

    let riderData = null;
    if (order.rider) {
      const rider = await Rider.findById(order.rider).select("name number");
      if (rider) {
        riderData = {
          name: rider.name,
          number: rider.number,
        };
      }
    }

    const orderWithExtras = {
      ...order.toObject(),
      distance,
      estimatedDeliveryTime: Math.round(estimatedDeliveryTime),
      rider: riderData,
    };

    res.status(200).json([orderWithExtras]);
  } catch (error) {
    console.error("Error fetching live order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Live Order Status
module.exports.liveOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Customer ID (_id) is required" });
    }

    const data = await LiveOrder.find({ customer: id });
    if (!data || data.length === 0) {
      return res.status(404).json({ message: "No order found" });
    } else {
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error("Error fetching past orders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Past-Order Route //
module.exports.pastOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Customer ID (_id) is required" });
    }

    const data = await PastOrder.find({ customer: id })
      .populate({
        path: "hotel",
        select: "hotel isServing location logo",
      })
      .populate({
        path: "payment",
        select: "transactionId status amount createdAt",
      })
      .sort({ orderedAt: -1 });

    if (!data || data.length === 0) {
      return res.status(200).json({ message: "No past orders found for you." });
    }

    const formattedData = data.map((order) => ({
      _id: order._id,
      ticketNumber: order.ticketNumber,
      orderOtp: order.orderOtp,
      status: order.status,
      customer: order.customer,
      hotel: order.hotel,
      payment: order.payment, // now included
      items: order.items,
      deliveryAddress: order.deliveryAddress,
      orderedAt: order.orderedAt,
      deliveredAt: order.deliveredAt,
      totalPrice: order.totalPrice,
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error("Error fetching past orders:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Payment Route //
module.exports.paymentInitiate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { user_id, sub_Total } = req.body;
    const transaction_Id = generateTransactionID();

    const customer = await Customer.findById(user_id, { number: 1 }).session(
      session
    );
    if (!customer) throw new Error("Customer not found");

    const payment_Data = await PaymentLog.create(
      [
        {
          transactionId: transaction_Id,
          status: "PENDING",
          customer: user_id,
          amount: sub_Total,
          mode: "ONLINE",
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    const payment_Id = payment_Data[0]._id;

    return res.json({
      status: 200,
      payment_Id,
      merchant_Id: process.env.PHONEPE_MERCHANT_ID,
      transaction_Id,
      merchant_User_Id: process.env.PHONEPE_USER_ID,
      mobile_Number: customer.number,
      environment: process.env.PHONEPE_ENVIRONMENT,
      salt_Index: process.env.PHONEPE_SALT_INDEX,
      salt_Key: process.env.PHONEPE_SALT_KEY,
      callback_Url: process.env.PHONEPE_CALLBACK_URL,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.log("Error at payment initiate route:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports.paymentConfirm = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { user_id, orderItems, paymentId, locationIndex, amount } = req.body;
    if (
      !user_id ||
      !orderItems?.length ||
      !paymentId ||
      locationIndex == null ||
      !amount
    ) {
      return res
        .status(400)
        .json({ status: "Failure", message: "Missing required fields" });
    }

    // 1. Update payment status
    const paymentRecord = await PaymentLog.findByIdAndUpdate(
      paymentId,
      { status: "SUCCESS" },
      { new: true }
    );

    if (!paymentRecord) {
      return res.status(404).json({
        status: "Failure",
        message: `Payment record not found: ${paymentId}`,
      });
    }

    session.startTransaction();

    // 2. Create live order
    const ticketNumber = generateTicket();
    const orderOtp = generateTicket();
    const orderData = {
      ticketNumber,
      orderOtp,
      customer: user_id,
      locationIndex,
      hotel: orderItems[0].restaurantId,
      items: orderItems.map((i) => ({ item: i._id, quantity: i.quantity })),
      totalPrice: amount,
      payment: paymentId,
    };
    const [createdOrder] = await LiveOrder.create([orderData], { session });


    await session.commitTransaction();
    session.endSession();

    const { getIO } = require("../socket"); // Adjust path if needed
    const io = getIO();

    io.to(`restaurant-${orderData.hotel}`).emit("orderRefresh");

    io.to(`restaurant-${orderData.hotel}`).emit("orderRefresh");

    return res.status(200).json({
      status: "SUCCESS",
      id: createdOrder._id,
      message: "Order placed and riders notified",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transaction aborted, error:", err);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

module.exports.liveOrderCancel = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: "FAILURE",
        message: "User ID is required",
      });
    }

    const deletedOrders = await LiveOrder.deleteMany({ customer: id });

    if (deletedOrders.deletedCount === 0) {
      return res.status(404).json({
        status: "FAILURE",
        message: "No live orders found for cancellation",
      });
    }

    return res.status(200).json({
      status: "SUCCESS",
      message: "Live order(s) cancelled successfully",
    });
  } catch (error) {
    console.error("Error at cancel order route:", error);
    return res.status(500).json({
      status: "FAILURE",
      message: "An error occurred while cancelling the order",
    });
  }
};

module.exports.codOrderConfirm = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { user_id, orderItems, locationIndex, amount } = req.body;

    if (!user_id || !orderItems?.length || locationIndex == null || !amount) {
      return res
        .status(400)
        .json({ status: "Failure", message: "Missing required fields" });
    }

    session.startTransaction();

    // 1. Create a PaymentLog entry with SUCCESS (COD)
    const transactionId = generateTransactionID();
    const [paymentLog] = await PaymentLog.create(
      [
        {
          transactionId,
          status: "NOT_COLLECTED",
          customer: user_id,
          amount,
          mode: "COD",
        },
      ],
      { session }
    );

    // 2. Create LiveOrder
    const ticketNumber = generateTicket();
    const orderOtp = generateTicket();
    const orderData = {
      ticketNumber,
      orderOtp,
      customer: user_id,
      locationIndex,
      hotel: orderItems[0].restaurantId,
      items: orderItems.map((i) => ({ item: i._id, quantity: i.quantity })),
      totalPrice: amount,
      payment: paymentLog._id,
      paymentMode: "COD",
    };

    const [createdOrder] = await LiveOrder.create([orderData], { session });

    await session.commitTransaction();
    session.endSession();

    // 3. Emit socket event to restaurant
    const { getIO } = require("../socket");
    const io = getIO();

    io.to(`restaurant-${orderData.hotel}`).emit("orderRefresh");

    const hotel = await Owner.findById(orderItems[0].restaurantId);

    // ✅ Notification payload
    const message = {
      tokens: hotel.fcmToken,
      // notification: {},
      android: {
        notification: {
          title: "🚨 Incoming Order Request!",
          body: "Someone’s hungry and counting on you. Tap to accept.⚡️",
          sound: "magicmenu_zing_enhanced",
          channelId: "custom-sound-channel",
        },
      },
      data: {
        type: "NEW_ORDER",
        title: "🚨 Incoming Order Request!",
        body: "Someone’s hungry and counting on you. Tap to accept.⚡️",
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
          token: hotel.fcmToken[i],
          success: r.success,
          error: r.error?.message || null,
        })),
      });
    }

    // ✅ Fallback: send individually
    const results = await Promise.all(
      hotel.fcmToken.map(async (token) => {
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
      status: "SUCCESS",
      id: createdOrder._id,
      message: "COD order placed successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("COD order transaction aborted:", err);
    return res.status(500).json({ status: "Failure", message: err.message });
  }
};

module.exports.liveOrderSupport = async (req, res) => {
  const { order_id } = req.params;

  if (!order_id) {
    return res.status(400).json({ error: "Order ID is required" });
  }

  try {
    // Fetch the order and populate restaurant/owner
    const order = await LiveOrder.findById(order_id).populate("hotel");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { hotel } = order;

    if (!hotel || !hotel.number) {
      return res.status(404).json({ error: "Support contact not available" });
    }

    res.json({
      hotel: hotel.number || null,
      support: process.env.SUPPORT || null,
    });
  } catch (err) {
    console.error("Error fetching live order support:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
