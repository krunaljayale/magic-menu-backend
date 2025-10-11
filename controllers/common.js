const Category = require("../models/category");
const GlobalAlert = require("../models/globalAlert");
const Animation = require("../models/animations");
const { serviceAreas } = require("../utils/serviceAreas");
const SplashImage = require("../models/splashImage");

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
    const animations = await Animation.find({ isActive: true }).sort({ order: 1 });
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
