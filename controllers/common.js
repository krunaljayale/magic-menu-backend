const Category = require("../models/category");

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
