const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const authMiddleware = require("../utils/jwtAuth");
const { settleRestaurantSettlements, registerAdmin, loginAdmin, getRegisteredRiders, getRiderData, editRiderDeposit, toggleBlockRider, getUnsettledOrders, markSettledOrders, getRegisteredRestaurants, getRestaurantData, profileRoute, toggleRestaurantBrand, getWeeklyOrders, getPendingPayouts, payPendingPayout, getPaidPayouts, getLiveOrders, getDashBodardData, getPastOrders, getSearchedOrder } = require("../controllers/admin");

router.post("/register-admin/:admin_id", wrapAsync(registerAdmin));
router.post("/login-admin", wrapAsync(loginAdmin));
router.get('/profile/:admin_id',wrapAsync(profileRoute));
// router.get('/settle-weekly-payouts',wrapAsync(settleRestaurantSettlements));

// Dashboard route
router.get("/get-dashboard-data",authMiddleware,wrapAsync(getDashBodardData));

// Riders routes
router.get("/get-registered-riders",authMiddleware,wrapAsync(getRegisteredRiders));
router.get("/get-rider-data/:id",authMiddleware,wrapAsync(getRiderData));
router.put("/edit-rider-deposit/:id",authMiddleware,wrapAsync(editRiderDeposit));
router.put("/toggle-block-rider/:id",authMiddleware,wrapAsync(toggleBlockRider));
router.get("/get-unsettled-orders/:id",authMiddleware,wrapAsync(getUnsettledOrders));
router.post("/mark-settled-orders/:admin_id",authMiddleware,wrapAsync(markSettledOrders));


// Restaurant routes
router.get("/get-registered-restaurants",authMiddleware,wrapAsync(getRegisteredRestaurants));
router.get("/get-restaurant-data/:id",authMiddleware,wrapAsync(getRestaurantData));
router.put("/toggle-restaurant-brand/:id",authMiddleware,wrapAsync(toggleRestaurantBrand));
router.get("/get-weekly-orders/:id",authMiddleware,wrapAsync(getWeeklyOrders));
router.get("/get-pending-payouts/:id",authMiddleware,wrapAsync(getPendingPayouts));
router.get("/get-paid-payouts/:id",authMiddleware,wrapAsync(getPaidPayouts));
router.post("/pay-pending-payout/:id",authMiddleware,wrapAsync(payPendingPayout));


// Orders Details routes
router.get("/get-live-orders",authMiddleware,wrapAsync(getLiveOrders));
router.get("/get-past-orders",authMiddleware,wrapAsync(getPastOrders));
router.get("/get-searched-past-order/:orderID",authMiddleware,wrapAsync(getSearchedOrder));

module.exports = router;