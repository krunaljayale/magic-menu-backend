const { generateWeeklySettlements } = require("../cron/weeklySettlement");



module.exports.homeRoute = async (req, res) => {
  res.send('Hii this is admin home route')
};


module.exports.settleRestaurantSettlements = async (req, res) => {
  try {
    await generateWeeklySettlements();
    res.status(200).json({ success: true, message: "Manual settlement generated successfully." });
  } catch (err) {
    console.error("Manual settlement error:", err.message);
    res.status(500).json({ success: false, message: "Failed to generate manual settlements.", error: err.message });
  }
};