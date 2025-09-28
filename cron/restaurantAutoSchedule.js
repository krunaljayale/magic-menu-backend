const cron = require("node-cron");
const moment = require("moment-timezone");
const Owner = require("../models/owner");
const admin = require("../config/firebaseAdmin");

// Run every minute in IST
cron.schedule(
  "* * * * *",
  async () => {
    try {
      const now = moment().tz("Asia/Kolkata");
      const currentDay = now.format("dddd").toLowerCase(); // monday, tuesday, etc
      const currentTime = now.format("HH:mm"); // 24-hour format

      // Fetch all auto-schedule enabled restaurants
      const restaurants = await Owner.find({ autoScheduleEnabled: true });

      for (const restaurant of restaurants) {
        const schedule = restaurant.weeklySchedule?.[currentDay];
        if (!schedule) continue;

        const openTime = schedule.open; // e.g., "18:43"
        const closeTime = schedule.close; // e.g., "22:00"
        if (!openTime || !closeTime) continue;

        // Check if it is exactly open or close time
        if (currentTime === openTime && !restaurant.isServing) {
          // Auto-open
          restaurant.isServing = true;
          await restaurant.save();
          // console.log(`[CRON] ${restaurant.name} auto-opened at ${openTime}`);

          // Send notification
          if (restaurant.fcmToken?.length) {
            const failedTokens = [];
            await Promise.all(
              restaurant.fcmToken.map(async (token) => {
                try {
                  await admin.messaging().send({
                    token,
                    android: {
                      notification: {
                        title: "🍽️ Auto Schedule Update",
                        body: "Your restaurant is now OPEN according to auto-schedule.",
                        sound: "magicmenu_zing_enhanced",
                        channelId: "custom-sound-channel",
                      },
                    },
                    data: {
                      type: "AUTO_SCHEDULE_STATUS",
                      status: "OPEN",
                    },
                  });
                } catch (err) {
                  console.error(
                    `[CRON ERROR] FCM failed for ${restaurant.name}, token: ${token} - ${err.message}`
                  );
                  if (
                    err.code === "messaging/invalid-argument" ||
                    err.code === "messaging/registration-token-not-registered"
                  ) {
                    failedTokens.push(token);
                  }
                }
              })
            );

            if (failedTokens.length) {
              restaurant.fcmToken = restaurant.fcmToken.filter(
                (t) => !failedTokens.includes(t)
              );
              await restaurant.save();
              console.log(
                `[CRON] Removed ${failedTokens.length} invalid tokens for ${restaurant.name}`
              );
            }
          }
        } else if (currentTime === closeTime && restaurant.isServing) {
          // Auto-close
          restaurant.isServing = false;
          await restaurant.save();
          // console.log(`[CRON] ${restaurant.name} auto-closed at ${closeTime}`);
        } else {
          // Not open/close minute → skip
          // console.log(`[CRON] Skipped ${restaurant.name}, not open/close time`);
          continue
        }
      }
    } catch (err) {
      console.error("[CRON ERROR] Auto on/off restaurants:", err);
    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);
