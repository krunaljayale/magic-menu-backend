// /crons/weeklySettlement.js
const cron = require("node-cron");
const moment = require("moment-timezone");
const RestaurantSettlement = require("../models/restaurantSettlement");
const PastOrder = require("../models/pastOrder");
const Owner = require("../models/owner");
const { sendAdminAlertEmail } = require("../utils/alertEmailSender");

const TIMEZONE = "Asia/Kolkata";

/**
 * Determines the correct previous Thursday–Wednesday range
 * no matter which day the script is triggered.
 */
function getLastWeekRange() {
  const now = moment.tz(TIMEZONE);
  const daysSinceThursday = (now.day() + 3) % 7; // day() = 0 (Sun) to 6 (Sat)
  const currentThursday = now
    .clone()
    .subtract(daysSinceThursday, "days")
    .startOf("day");

  const weekStart = currentThursday.clone().subtract(7, "days"); // Previous Thursday 12:00 AM
  const weekEnd = currentThursday.clone().subtract(1, "days").endOf("day"); // Last Wednesday 11:59:59 PM

  return { weekStart, weekEnd, now };
}

async function generateWeeklySettlements() {
  const { weekStart, weekEnd, now } = getLastWeekRange();

  try {
    // throw new Error("Manual test error for email alert 🚨");
    const allHotels = await Owner.find({});
    let createdCount = 0;

    for (const hotel of allHotels) {
      const alreadyExists = await RestaurantSettlement.findOne({
        hotel: hotel._id,
        weekStart: weekStart.toDate(),
        weekEnd: weekEnd.toDate(),
      });

      if (alreadyExists) continue;

      const orders = await PastOrder.find({
        hotel: hotel._id,
        status: "DELIVERED",
        orderedAt: {
          $gte: weekStart.toDate(),
          $lte: weekEnd.toDate(),
        },
      });

      if (orders.length === 0) continue;

      let grossRevenue = 0;
      orders.forEach((order) => {
        order.items.forEach((item) => {
          grossRevenue += item.price * item.quantity;
        });
      });

      const commissionRate = 0.2;
      const gstRate = 0.18;
      const commissionAmount = grossRevenue * commissionRate;
      const taxOnCommission = commissionAmount * gstRate;
      const netRevenue = grossRevenue - commissionAmount - taxOnCommission;

      await RestaurantSettlement.create({
        hotel: hotel._id,
        weekStart: weekStart.toDate(),
        weekEnd: weekEnd.toDate(),
        totalOrders: orders.length,
        grossRevenue: parseFloat(grossRevenue.toFixed(2)),
        commissionAmount: parseFloat(commissionAmount.toFixed(2)),
        taxOnCommission: parseFloat(taxOnCommission.toFixed(2)),
        netRevenue: parseFloat(netRevenue.toFixed(2)),
        generatedAt: now.toDate(),
        status: "PENDING",
      });

      createdCount++;
    }

    console.log(
      `✅ Weekly settlements created: ${createdCount} for ${weekStart.format(
        "DD MMM"
      )} – ${weekEnd.format("DD MMM YYYY")}`
    );
  } catch (err) {
    console.error("❌ Error generating settlements:", err.message);
    await sendAdminAlertEmail(
      "❌ Weekly Settlement Cron Failed",
      `An error occurred during weekly settlement.\n\nTime: ${now.format(
        "YYYY-MM-DD HH:mm:ss"
      )}\nWeek: ${weekStart.format("DD MMM")} – ${weekEnd.format(
        "DD MMM YYYY"
      )}\n\nError:\n${err.stack || err.message}`
    );
  }
}

function startWeeklySettlementCron() {
  cron.schedule("0 0 * * 4", generateWeeklySettlements, {
    timezone: TIMEZONE,
  });
}

module.exports = {
  startWeeklySettlementCron,
  generateWeeklySettlements,
};
