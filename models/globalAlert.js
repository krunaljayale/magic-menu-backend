const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const alertSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String, // Optional image URL
  },
  buttonText: {
    type: String,
    default: "Update Now", // Same for all apps
  },
  isSkippable: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  type: {
    type: String,
    enum: ["force_update", "optional_update", "info", "promo", "maintenance"],
    default: "info",
  },
  // Version codes per app
  minimumVersionCodes: {
    type: Map,
    of: Number,
    required: true,
    default: {},
  },
  maximumVersionCodes: {
    type: Map,
    of: Number,
    default: {},
  },
  // Button link per app
  buttonLinks: {
    type: Map,
    of: String, // e.g., { customer: "https://play.google.com/.../customer", restaurant: "...", delivery: "..." }
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 🔹 Ensure only one alert exists (singleton)
alertSchema.statics.ensureSingleDoc = async function () {
  const count = await this.countDocuments();
  if (count >= 1) throw new Error("Only one global alert is allowed");
};

// 🔹 Get alert for a specific app and version
alertSchema.statics.getAlertForApp = async function (app, versionCode) {
  const alert = await this.findOne({ isActive: true });
  if (!alert) return null;

  const minVersion = alert.minimumVersionCodes.get(app);
  const maxVersion = alert.maximumVersionCodes.get(app);

  if (minVersion !== undefined && versionCode < minVersion) {
    return {
      ...alert.toObject(),
      buttonLink:
        alert.buttonLinks.get(app) || alert.buttonLinks.get("all") || "",
    };
  }

  if (maxVersion !== undefined && versionCode > maxVersion) {
    return {
      ...alert.toObject(),
      buttonLink:
        alert.buttonLinks.get(app) || alert.buttonLinks.get("all") || "",
    };
  }

  return null; // version ok → no alert
};

const GlobalAlert = mongoose.model("GlobalAlert", alertSchema);
module.exports = GlobalAlert;
