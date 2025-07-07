// cron/autoStopServing.js
const cron = require('node-cron');
const Owner = require('../models/owner');

// Run every day at 12:00 AM IST
cron.schedule('0 0 * * *', async () => {
  try {
    // console.log('[CRON] Auto-stopping all restaurants at 12:00 AM');

    const result = await Owner.updateMany(
      { isServing: true },
      { $set: { isServing: false } }
    );

    console.log(`[CRON] ${result.modifiedCount} restaurants set to isServing: false`);
  } catch (err) {
    console.error('[CRON ERROR] Failed to auto-stop restaurants:', err);
  }
}, {
  timezone: 'Asia/Kolkata', // Important for 12AM IST
});
