const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { category, auth } = require("../controllers/common");
const authMiddleware = require("../utils/jwtAuth");


router.get("/category", wrapAsync(category));
router.get('/auth',authMiddleware,wrapAsync(auth));

module.exports = router;