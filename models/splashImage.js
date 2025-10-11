const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const splashImageSchema = new Schema(
  {
    placement: { type: String, required: true }, // e.g., "bottom_left_rangoli"
    type: {
      type: String,
      enum: ["main", "side"],
      required: true,
    },
    url: { type: String, required: true }, 
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SplashImage = mongoose.model("SplashImage", splashImageSchema);
module.exports = SplashImage;
