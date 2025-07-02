// const admin = require("../config/firebaseAdmin");


// const sendNotification = async (fcmToken, title, body) => {
//   const message = {
//     token: fcmToken,
//     notification: {
//       title: title,
//       body: body,
//     },
//   };

//   try {
//     const response = await admin.messaging().send(message);
//     console.log("Notification sent successfully:", response);
//     return { success: true, response };
//   } catch (error) {
//     console.error("Error sending notification:", error);
//     return { success: false, error };
//   }
// };

// module.exports = { sendNotification };
