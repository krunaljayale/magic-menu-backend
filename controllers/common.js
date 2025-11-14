const Category = require("../models/category");
const GlobalAlert = require("../models/globalAlert");
const Animation = require("../models/animations");
const { serviceAreas } = require("../utils/serviceAreas");
const SplashImage = require("../models/splashImage");
const admin = require("../config/firebaseAdmin");
const Customer = require("../models/customer");
const { sendPushNotification } = require("../utils/notificationHelper");

module.exports.category = async (req, res) => {
  let category = await Category.find();
  res.send(category);
};

module.exports.auth = async (req, res) => {
  res.status(200).json({ message: "User is Logged in" });
};

module.exports.getConfig = async (req, res) => {
  try {
    const config = {
      AOV: process.env.AOV || 300,
      deliveryCharge: process.env.DELIVERY_CHARGE || 30,
      minCODValue: process.env.MIN_COD_VALUE || 100,
      maxCODValue: process.env.MAX_COD_VALUE || 500,
      platformFee: process.env.PLATFORM_FEE || 0,
    };

    res.json(config);
  } catch (err) {
    console.error("Error fetching config:", err);
    res.status(500).json({ error: "Failed to load config" });
  }
};

module.exports.getServiceAreas = async (req, res) => {
  try {
    res.json(serviceAreas);
  } catch (err) {
    console.error("Error fetching serviceAreas:", err);
    res.status(500).json({ error: "Failed to load serviceAreas" });
  }
};

module.exports.getActiveAnimations = async (req, res) => {
  try {
    const animations = await Animation.find({ isActive: true }).sort({
      order: 1,
    });
    res.json(animations);
  } catch (err) {
    console.error("Error fetching animations:", err);
    res.status(500).json({ error: "Failed to load animations" });
  }
};

module.exports.getSplashImages = async (req, res) => {
  try {
    const images = await SplashImage.find({ isActive: true });
    res.json(images);
  } catch (err) {
    console.error("Error fetching images:", err);
    res.status(500).json({ error: "Failed to load images" });
  }
};

module.exports.checkAlert = async (req, res) => {
  try {
    const { app, versionCode } = req.params;

    if (!app) {
      return res.status(400).json({ message: "App parameter is required" });
    }

    // Default versionCode if not provided or invalid
    let clientVersionCode = versionCode ? parseInt(versionCode, 10) : 1;
    if (isNaN(clientVersionCode)) clientVersionCode = 1;

    // Fetch the single active alert
    const activeAlert = await GlobalAlert.findOne({ isActive: true });

    if (!activeAlert) {
      return res
        .status(404)
        .json({ message: "No active alert for this version" });
    }

    // Get app-specific min/max versions and buttonLink
    const minVersion = activeAlert.minimumVersionCodes.get(app);
    const maxVersion = activeAlert.maximumVersionCodes.get(app);

    // If version is below min or above max → alert applies
    if (
      (minVersion !== undefined && clientVersionCode < minVersion) ||
      (maxVersion !== undefined && clientVersionCode > maxVersion)
    ) {
      return res.status(200).json({
        isActive: activeAlert.isActive,
      });
    }

    // Otherwise, no alert needed
    return res.status(204).json({ message: "No alert for this version" });
  } catch (error) {
    console.error("Error fetching alert:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

module.exports.getAlert = async (req, res) => {
  try {
    const { app } = req.params;
    if (!app)
      return res.status(400).json({ message: "App parameter is required" });

    // Fetch the active alert
    const activeAlert = await GlobalAlert.findOne({ isActive: true });
    if (!activeAlert)
      return res.status(404).json({ message: "No active alert" });

    // Get app-specific min/max version
    const minVersion = activeAlert.minimumVersionCodes.get(app);
    const maxVersion = activeAlert.maximumVersionCodes.get(app);
    const buttonLink = activeAlert.buttonLinks.get(app) || "";

    // Default client version to 1 if none provided (or invalid)
    let clientVersionCode = 1;
    if (req.query.versionCode) {
      const parsed = parseInt(req.query.versionCode, 10);
      if (!isNaN(parsed)) clientVersionCode = parsed;
    }

    // Check if alert applies
    if (
      (minVersion !== undefined && clientVersionCode < minVersion) ||
      (maxVersion !== undefined && clientVersionCode > maxVersion)
    ) {
      return res.status(200).json({
        title: activeAlert.title,
        message: activeAlert.message,
        imageUrl: activeAlert.imageUrl || null,
        buttonText: activeAlert.buttonText, // same for all apps
        buttonLink, // app-specific
        isSkippable: activeAlert.isSkippable,
        isActive: activeAlert.isActive,
      });
    }

    // No alert needed
    return res.status(204).json({ message: "No alert for this version" });
  } catch (err) {
    console.error("Error fetching alert:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

module.exports.sendHardcodedNotification = async (req, res) => {
  try {
    const tokens = [
      "drCoj0XfR4aFpmKc28kElt:APA91bGrzpvZs5vrKpECmUU7KSoHZWOcJPAKGkiIw4X6dz7vFSO33ynp14KbulLtxAE_VZmyAX8Hlef1Mqmu50yztOvnPND699tjK9y5oxg0Pt4I3HMWloA",
      "eQLcS2wvRXqC7DOHGXTkOx:APA91bEjydVA05I_Ss1GfDuk7oCtsDpdwwEAwh8mD9tfY3jRBW8l2c8LgG4Oeh2b5eB9sOEiwQlaOX_lZ2VzU13qucDlT0k22x568JmDs5dR4eBLe6tJZaI",
      "dIRRQBPnRxePkknfKB62_w:APA91bFKUbO04uT5qw6kS95Dt1Zuog-K3hPkQpfNGsardjOG0exohVglcdPcOvIV1H4ulmx7ahlSTKkk7CseZYZ06UWM2eLoGLRnqRbiKpg0ZETAiP7JXV0",
      "dD_zD21eRsGsxwKH-N4OOn:APA91bGZPKRWR6cRCEyah7sWdatTIqCbexu369OFBeD6sByZ5fSjeiSRn4zvp_SLCg1wWLWEDV7o6Cn2z7yOs4o41gzTIfXhCVqYwzOifHzj9e4GwkUwaaU",
      "eg5PG3P2R1S75I-m0srVyy:APA91bGHeKfj3gWBWRj5OVDW3Sq5LHSWSwpCPDGEA1dQovkYaSIhnY9rvx606upuqUDdcbc9nFNhnc7xhgullPxe-LvFv0NPdyadeO0l4rViQbUttM0E84E",
    ];

    if (!tokens.length) {
      return res.status(400).json({ message: "No FCM tokens defined" });
    }

    // IMPORTANT: put title/body at top-level `notification` so system shows it
    const baseMessage = {
      tokens,
      notification: {
        title: "Test Notification 🚴‍♂️",
        body: "This is a test push notification from MagicMenu backend!",
      },
      // data payload for app logic (string values only)
      data: {
        type: "TEST_PUSH",
        orderId: "demo-123", // example
        title: "Test Notification 🚴‍♂️", // duplicate is fine
        body: "This is a test push notification from MagicMenu backend!",
      },

      // Android specific: include title/body again for Android notification builder,
      // set priority, TTL etc.
      android: {
        priority: "high",
        ttl: 60 * 60 * 1000, // 1 hour in ms
        notification: {
          title: "Test Notification 🚴‍♂️",
          body: "This is a test push notification from MagicMenu backend!",
          sound: "magicmenu_zing_enhanced", // must match channel config
          channelId: "custom-sound-channel",
          // optionally set click_action to open app activity
          clickAction: "FLUTTER_NOTIFICATION_CLICK", // or your action
        },
      },

      // iOS / APNS: ensure APNs shows notification (aps)
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            alert: {
              title: "Test Notification 🚴‍♂️",
              body: "This is a test push notification from MagicMenu backend!",
            },
            sound: "magicmenu_zing_enhanced.aiff", // ensure file present in app bundle
            badge: 1,
            "content-available": 1,
          },
        },
      },
    };

    // Prefer sendMulticast (max 500 tokens per call)
    if (typeof admin.messaging().sendMulticast === "function") {
      // Send in batches if >500
      const BATCH = 500;
      const allResults = [];
      for (let i = 0; i < tokens.length; i += BATCH) {
        const chunkTokens = tokens.slice(i, i + BATCH);
        const m = { ...baseMessage, tokens: chunkTokens };
        const resp = await admin.messaging().sendMulticast(m);
        allResults.push(
          ...chunkTokens.map((t, idx) => ({
            token: t,
            success: resp.responses[idx].success,
            error: resp.responses[idx].error?.message || null,
          }))
        );
      }
      const successCount = allResults.filter((r) => r.success).length;
      const failureCount = allResults.length - successCount;
      return res.status(200).json({
        message: "Sent",
        total: allResults.length,
        successCount,
        failureCount,
        responses: allResults,
      });
    }

    // fallback single sends
    const results = await Promise.all(
      tokens.map(async (token) => {
        try {
          await admin.messaging().send({ token, ...baseMessage });
          return { token, success: true };
        } catch (err) {
          return { token, success: false, error: err.message };
        }
      })
    );

    return res.status(200).json({
      message: "Notification sent individually",
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      responses: results,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    return res
      .status(500)
      .json({ message: "Error sending notification", error: error.message });
  }
};

module.exports.sendTestNotification = async (req, res) => {
  try {
    const rider = {
      fcmToken: [
        "drCoj0XfR4aFpmKc28kElt:APA91bGrzpvZs5vrKpECmUU7KSoHZWOcJPAKGkiIw4X6dz7vFSO33ynp14KbulLtxAE_VZmyAX8Hlef1Mqmu50yztOvnPND699tjK9y5oxg0Pt4I3HMWloA",
        "eQLcS2wvRXqC7DOHGXTkOx:APA91bEjydVA05I_Ss1GfDuk7oCtsDpdwwEAwh8mD9tfY3jRBW8l2c8LgG4Oeh2b5eB9sOEiwQlaOX_lZ2VzU13qucDlT0k22x568JmDs5dR4eBLe6tJZaI",
        "dIRRQBPnRxePkknfKB62_w:APA91bFKUbO04uT5qw6kS95Dt1Zuog-K3hPkQpfNGsardjOG0exohVglcdPcOvIV1H4ulmx7ahlSTKkk7CseZYZ06UWM2eLoGLRnqRbiKpg0ZETAiP7JXV0",
        "dD_zD21eRsGsxwKH-N4OOn:APA91bGZPKRWR6cRCEyah7sWdatTIqCbexu369OFBeD6sByZ5fSjeiSRn4zvp_SLCg1wWLWEDV7o6Cn2z7yOs4o41gzTIfXhCVqYwzOifHzj9e4GwkUwaaU",
        "eg5PG3P2R1S75I-m0srVyy:APA91bGHeKfj3gWBWRj5OVDW3Sq5LHSWSwpCPDGEA1dQovkYaSIhnY9rvx606upuqUDdcbc9nFNhnc7xhgullPxe-LvFv0NPdyadeO0l4rViQbUttM0E84E",
        "cW1KVwBTS7auqzugfq0TYl:APA91bFqAFBElhEz4-KbyDT0HcuKj6gqquLKvSGnr_hm5uTXiX84-l1Rqe6ep5rCA0I7GEwjfGVrGR0F7EOMP2pO2dPo13llGdHHlS9tG1gsC7AfRdqFJCU",
        "cIM8NoroTiW7piBCodfQtf:APA91bHAAw2DuPX8KV1nS-X9wXIhYjrqhXucB7e_cgRFD_tlk025pU_Vkt9pKgwn2K3U0jxJTlfTSbvEkV3hszUxgkAyT0dfE09tYMrzLKXFdxNm5X84Iuo",
      ],
    };

    // ✅ Notification payload (note: top-level notification so OS can display title/body)
    const message = {
      tokens: rider.fcmToken,
      notification: {
        title: "प्रिय असलम शहा",
        body: "हमें आपके नाम से एक ऑर्डर प्राप्त हुआ है। लेकिन जब हमने दिए गए नंबर पर कॉल किया, तो वहाँ से बताया गया कि उन्होंने यह ऑर्डर नहीं दिया है। इसी कारण हमने यह ऑर्डर अभी स्वीकृत नहीं किया है, ताकि किसी प्रकार की असुविधा न हो।अगर यह ऑर्डर वास्तव में आपने ही किया है, तो कृपया हमें जल्द पुष्टि करें।",
        // image:
        //   "https://img.freepik.com/premium-vector/megaphone-with-alert-speech-bubble-banner-loudspeaker_1027249-726.jpg?w=1480",
      },
      android: {
        notification: {
          title: "प्रिय असलम शहा",
          body: "हमें आपके नाम से एक ऑर्डर प्राप्त हुआ है। लेकिन जब हमने दिए गए नंबर पर कॉल किया, तो वहाँ से बताया गया कि उन्होंने यह ऑर्डर नहीं दिया है। इसी कारण हमने यह ऑर्डर अभी स्वीकृत नहीं किया है, ताकि किसी प्रकार की असुविधा न हो। अगर यह ऑर्डर वास्तव में आपने ही किया है, तो कृपया हमें जल्द पुष्टि करें।",
          sound: "magicmenu_zing_enhanced",
          channelId: "custom-sound-channel",
        },
        priority: "high",
      },
      data: {
        type: "NEW_ORDER",
        title: "प्रिय असलम शहा",
        body: "हमें आपके नाम से एक ऑर्डर प्राप्त हुआ है। लेकिन जब हमने दिए गए नंबर पर कॉल किया, तो वहाँ से बताया गया कि उन्होंने यह ऑर्डर नहीं दिया है। इसी कारण हमने यह ऑर्डर अभी स्वीकृत नहीं किया है, ताकि किसी प्रकार की असुविधा न हो। अगर यह ऑर्डर वास्तव में आपने ही किया है, तो कृपया हमें जल्द पुष्टि करें।",
      },
    };

    // ✅ Send multicast if supported (recommended)
    if (typeof admin.messaging().sendMulticast === "function") {
      const response = await admin.messaging().sendMulticast(message);

      return res.status(200).json({
        message: "Notification sent successfully",
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses.map((r, i) => ({
          token: rider.fcmToken[i],
          success: r.success,
          error: r.error?.message || null,
        })),
      });
    }

    // ✅ Fallback: send individually
    // IMPORTANT: do NOT include `tokens` when calling admin.messaging().send for a single token.
    const results = await Promise.all(
      rider.fcmToken.map(async (token) => {
        try {
          await admin.messaging().send({
            token,
            notification: message.notification,
            android: message.android,
            data: message.data,
          });
          return { token, success: true };
        } catch (err) {
          return { token, success: false, error: err.message };
        }
      })
    );

    return res.status(200).json({
      message: "Notification sent individually",
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      responses: results,
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
    return res.status(500).json({ message: "Error sending notification" });
  }
};

module.exports.sendPushNoti = async (req, res) => {
  const customer = await Customer.findOne({ number: 9284454408 });
  const result = await sendPushNotification(customer.fcmToken, {
    title: "Nisha, Abhishek I love you❤️",
    body: "Your grub is being prepared! We'll notify you once our delivery partner picks it up. 🏍️",
    image:
      "https://res.cloudinary.com/dcgskimn8/image/upload/v1758391222/rider_preset/bkckc6pneo8jm6n3weav.jpg",

    android: {
      channelId: "custom-sound-channel",
      sound: "magicmenu_zing_enhanced",
    },
  });

  res.status(200).json(result);
};

// "https://res.cloudinary.com/dcgskimn8/image/upload/v1751294918/Delivery_Boy_1_tf3ynj.jpg",