const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { category, auth, getConfig, checkAlert, getAlert } = require("../controllers/common");
const authMiddleware = require("../utils/jwtAuth");


router.get("/category", wrapAsync(category));
router.get('/auth',authMiddleware,wrapAsync(auth));
router.get('/config',wrapAsync(getConfig));
router.get('/checkAlert/:app/:versionCode',wrapAsync(checkAlert));
router.get('/getAlert/:app',wrapAsync(getAlert));

module.exports = router;