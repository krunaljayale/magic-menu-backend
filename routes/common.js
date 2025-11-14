const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { category, auth, getConfig, checkAlert, getAlert, getServiceAreas, getActiveAnimations, getSplashImages, sendTestNotification, sendPushNoti } = require("../controllers/common");
const authMiddleware = require("../utils/jwtAuth");


router.get("/category", wrapAsync(category));
router.get('/auth',authMiddleware,wrapAsync(auth));
router.get('/config',wrapAsync(getConfig));
router.get('/serviceAreas',wrapAsync(getServiceAreas));
router.get('/get-animations',wrapAsync(getActiveAnimations));
router.get('/get-splash-images',wrapAsync(getSplashImages));
router.get('/checkAlert/:app/:versionCode',wrapAsync(checkAlert));
router.get('/getAlert/:app',wrapAsync(getAlert));


// router.get('/send-hard-notification',wrapAsync(sendTestNotification));

// router.get('/send-push',wrapAsync(sendPushNoti));

module.exports = router;