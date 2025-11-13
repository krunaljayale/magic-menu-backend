// utils/notifications.js
// Helper: send push notifications to multiple FCM tokens.
// Requires firebase-admin to be initialized elsewhere (admin.initializeApp({...}))
//
// Usage:
// const { sendPushNotification } = require('@/utils/notifications');
// await sendPushNotification(tokensArray, {
//   title: "Title",
//   body: "Body text",
//   data: { foo: "bar" },
//   android: { channelId: "custom-sound-channel", sound: "magicmenu_zing_enhanced" }
// });

const admin = require("../config/firebaseAdmin");

/**
 * Send push notification to multiple FCM tokens.
 * @param {string[]} fcmTokens - Array of FCM registration tokens (can be empty).
 * @param {object} opts
 * @param {string} opts.title - Notification title (required)
 * @param {string} opts.body - Notification body (required)
 * @param {string} opts.image - Notification body (required)
 * @param {object} [opts.data] - Optional key-value data payload (values must be strings)
 * @param {object} [opts.android] - Optional Android notification overrides (channelId, sound, priority)
 * @returns {Promise<{ successCount: number, failureCount: number, responses: Array }>}
 */
async function sendPushNotification(fcmTokens = [], opts = {}) {
  if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) {
    return { successCount: 0, failureCount: 0, responses: [] };
  }

  if (!admin || !admin.messaging) {
    throw new Error("firebase-admin not initialized. Call admin.initializeApp(...) before using notifications.");
  }

  const title = String(opts.title || "");
  const body = String(opts.body || "");
  const image = String(opts.image || "");
  const data = opts.data || {};
  const androidOpts = opts.android || {};

  // Ensure data values are strings (FCM requires string values)
  const normalizedData = Object.keys(data || {}).reduce((acc, k) => {
    acc[k] = data[k] == null ? "" : String(data[k]);
    return acc;
  }, {});

  // Build a multicast message (recommended)
  const message = {
    tokens: fcmTokens,
    notification: {
      title,
      body,
      image
    },
    data: normalizedData,
    android: {
      notification: {
        title,
        body,
        image,
        channelId: androidOpts.channelId || "default",
        sound: androidOpts.sound || "default",
      },
      priority: androidOpts.priority || "high",
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title,
            body,
            image,
          },
          sound: androidOpts.sound || "default",
        },
      },
    },
  };

  try {
    // If sendMulticast is available (server SDK), use it for efficiency
    if (typeof admin.messaging().sendMulticast === "function") {
      const resp = await admin.messaging().sendMulticast(message);
      // resp.responses is an array aligned to tokens
      const responses = resp.responses.map((r, idx) => ({
        token: fcmTokens[idx],
        success: r.success,
        error: r.success ? null : (r.error ? r.error.message : "unknown error"),
      }));
      return {
        successCount: resp.successCount || responses.filter((r) => r.success).length,
        failureCount: resp.failureCount || responses.filter((r) => !r.success).length,
        responses,
      };
    }

    // Fallback: send individually
    const results = await Promise.all(
      fcmTokens.map(async (token) => {
        try {
          await admin.messaging().send({
            token,
            notification: { title, body },
            data: normalizedData,
            android: message.android,
            apns: message.apns,
          });
          return { token, success: true, error: null };
        } catch (err) {
          return { token, success: false, error: err.message || "send failed" };
        }
      })
    );

    return {
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      responses: results,
    };
  } catch (err) {
    // Top-level failure (e.g., invalid tokens array or admin issues)
    throw new Error(`Push send failed: ${err.message || err}`);
  }
}

module.exports = { sendPushNotification };
