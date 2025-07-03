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
    type: String, // Optional
  },
  buttonText: {
    type: String,
    default: "Update Now",
  },
  buttonLink: {
    type: String, // Play Store or any external/internal link
  },
  isSkippable: {
    type: Boolean,
    default: false, // If false, user cannot dismiss modal
  },
  minimumVersionCode: {
    type: Number,
    default: null, // Below this version, the app is blocked
  },
  maximumVersionCode: {
    type: Number,
    default: null, // Optionally limit to certain versions
  },
  isActive: {
    type: Boolean,
    default: true, // Easily disable without deleting
  },
  type: {
    type: String,
    enum: ["force_update", "optional_update", "info", "promo", "maintenance"],
    default: "info",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Prevent multiple documents (singleton)
alertSchema.statics.ensureSingleDoc = async function () {
  const count = await this.countDocuments();
  if (count >= 1) {
    throw new Error("Only one alert document is allowed");
  }
};

const GlobalAlert = mongoose.model("GlobalAlert", alertSchema);
module.exports = GlobalAlert;