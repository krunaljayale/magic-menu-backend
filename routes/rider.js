const express = require("express");
const router = express.Router();

const wrapAsync = require("../utils/wrapAsync");
const authMiddleware = require("../utils/jwtAuth");
const { getOTP, registerData, login, toggleDuty, auth,registerFCM, newOrder, changeStatus, getHotelData, getOrderData, getCustomerData, getCompleteOrderData, completeOrder, profileInfo, profileEdit, sendTestNotification, acceptOrder, reachedPickup, orderPickedup, orderReachedDrop, getCollectionReport} = require("../controllers/rider");




router.post("/getotp", wrapAsync(getOTP));
router.post("/register", wrapAsync(registerData));
router.post("/login", wrapAsync(login));


router.get('/:id/auth',authMiddleware,wrapAsync(auth));
router.post('/:id/fcm-token',authMiddleware,wrapAsync(registerFCM));
router.get('/:id/toggleDuty',authMiddleware,wrapAsync(toggleDuty));
router.post('/newOrder',authMiddleware,wrapAsync(newOrder));
router.get('/:id/change-order-status/:_id/:status',authMiddleware,wrapAsync(changeStatus));
router.get('/:id/hotel-data',authMiddleware,wrapAsync(getHotelData));
router.get('/:id/order-data',authMiddleware,wrapAsync(getOrderData));
router.get('/:id/customer-data',authMiddleware,wrapAsync(getCustomerData));
router.get('/:id/complete-data',authMiddleware,wrapAsync(getCompleteOrderData));
router.get('/:user_id/get-collection-report',authMiddleware,wrapAsync(getCollectionReport));

// delivery route
router.post('/:user_id/accept-order', authMiddleware,wrapAsync(acceptOrder));
router.post('/:user_id/reached-pickup', authMiddleware,wrapAsync(reachedPickup));
router.post('/:user_id/order-pickedup', authMiddleware,wrapAsync(orderPickedup));
router.post('/:user_id/order-reached-drop', authMiddleware,wrapAsync(orderReachedDrop));
router.post('/:order_id/complete-order',authMiddleware,wrapAsync(completeOrder));

router.get('/:id/profile',authMiddleware,wrapAsync(profileInfo));
router.post('/:id/profile/edit',authMiddleware,wrapAsync(profileEdit));



router.get('/send-notification/:id',wrapAsync(sendTestNotification));

module.exports = router;