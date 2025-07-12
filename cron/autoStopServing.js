const cron = require('node-cron');
const Owner = require('../models/owner');
const Rider = require('../models/rider');

// Run every day at 12:00 AM IST
cron.schedule('0 0 * * *', async () => {
  try {
    // 1️ Stop all restaurants
    const restaurantResult = await Owner.updateMany(
      { isServing: true },
      { $set: { isServing: false } }
    );

    // 2️ Set all riders to off-duty
    const riderResult = await Rider.updateMany(
      { onDuty: true },
      { $set: { onDuty: false } }
    );

    console.log(`[CRON] ${restaurantResult.modifiedCount} restaurants set to isServing: false`);
    console.log(`[CRON] ${riderResult.modifiedCount} riders set to onDuty: false`);
  } catch (err) {
    console.error('[CRON ERROR] Failed to auto-stop restaurants and riders:', err);
  }
}, {
  timezone: 'Asia/Kolkata', // Important for 12AM IST
});
