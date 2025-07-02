const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const adminSchema = new Schema(
  {
    name: { type: String, required: true },
    number: { type: Number, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // hashed in production
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "CITY_ADMIN", "SETTLEMENT_MANAGER"],
      default: "CITY_ADMIN",
    },
    city: { type: String }, // optional for regional control
    fcmToken: [String], // for admin app notifications
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Admin = mongoose.model("Admin", adminSchema);
module.exports = Admin;
