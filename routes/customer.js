const express = require("express");
const router = express.Router();
const {
  listingData,
  hotelData,
  data,
  getOTP,
  registerData,
  login,
  profile,
  categorySuggestion,
  categoryRestaurant,
  allAddress,
  addAddress,
  updateAddress,
  pastOrder,
  paymentInitiate,
  paymentConfirm,
  liveOrder,
  liveOrderStatus,
  liveOrderCancel,
  updateDefault,
  deleteAddress,
  registerFCM,
  getAddOns,
  codOrderConfirm,
  toggleNotification
} = require("../controllers/customer");
const wrapAsync = require("../utils/wrapAsync");
const authMiddleware = require("../utils/jwtAuth");



// Public Routes (no authentication required)
router.get("/:user_id/data",wrapAsync(data));
router.get("/:_id/:id/hotelData", wrapAsync(hotelData));
router.get("/:id/listingData/:category", wrapAsync(listingData));
router.post("/get-addons", wrapAsync(getAddOns));
router.post("/getotp", wrapAsync(getOTP));
router.post("/register", wrapAsync(registerData));
router.post("/login", wrapAsync(login));

// Protected Routes (authentication required)
router.get("/:id/profile", authMiddleware, wrapAsync(profile));// Only authenticated users can access profile
router.patch("/:id/profile/toggle-notification", authMiddleware, wrapAsync(toggleNotification)); 
router.post('/:id/fcm-token',authMiddleware,wrapAsync(registerFCM));
router.get("/:id/address", authMiddleware, wrapAsync(allAddress)); // Only authenticated users can access address data
router.get("/:id/address/:addressId/update-default", authMiddleware, wrapAsync(updateDefault)); // Only authenticated users can access address data
router.post("/address", authMiddleware, wrapAsync(addAddress)); // Only authenticated users can add an address
router.post("/address/update", authMiddleware, wrapAsync(updateAddress)); // Only authenticated users can update an address
router.get("/:id/address/:addressId/delete-address", authMiddleware, wrapAsync(deleteAddress)); // Only authenticated users can update an address
// router.post("/order", authMiddleware, wrapAsync(order)); // Only authenticated users can update an address
router.get("/:id/past-order", authMiddleware, wrapAsync(pastOrder)); // Only authenticated users can see past orders
router.get("/:id/live-order/:orderId", authMiddleware, wrapAsync(liveOrder)); // Only authenticated users can see live orders
router.get("/:id/status/live-order", authMiddleware, wrapAsync(liveOrderStatus)); // Only authenticated users can see live orders


// For temporary cancel order
router.get("/:id/cancel/live-order", authMiddleware, wrapAsync(liveOrderCancel)); // Only authenticated users can see live orders

// Payment Router
router.post("/payment/initiate",authMiddleware,wrapAsync(paymentInitiate));
router.post("/payment/confirm",authMiddleware,wrapAsync(paymentConfirm)); // Also customer order api 
// router.post("/payment/webhook",authMiddleware,wrapAsync(paymentWebhook));
router.post("/COD/order-confirm",authMiddleware,wrapAsync(codOrderConfirm)); // Customer COD order api 



// Category routes (could be public or protected based on your use case)
router.get("/:category/suggestion", wrapAsync(categorySuggestion));
router.get("/:category/restaurant", wrapAsync(categoryRestaurant));

module.exports = router;
