const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const authMiddleware = require("../utils/jwtAuth");
const { homeRoute, settleRestaurantSettlements } = require("../controllers/admin");


router.get('/home',wrapAsync(homeRoute));
router.get('/settle-weekly-payouts',wrapAsync(settleRestaurantSettlements));

module.exports = router;