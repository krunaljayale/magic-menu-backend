const admin = require("firebase-admin");
const serviceAccount = require("/etc/secrets/magic-menu-master-firebase-adminsdk-fbsvc-b2b45b8ee0.json"); // Download this from Firebase Console > Project Settings > Service accounts

// const serviceAccount = require("../assets/magic-menu-master-firebase-adminsdk-fbsvc-b2b45b8ee0.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
