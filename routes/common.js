const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { category, auth, getConfig } = require("../controllers/common");
const authMiddleware = require("../utils/jwtAuth");


router.get("/category", wrapAsync(category));
router.get('/auth',authMiddleware,wrapAsync(auth));
router.get('/config',wrapAsync(getConfig));

module.exports = router;