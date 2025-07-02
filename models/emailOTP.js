// models/EmailOtp.js
const mongoose = require("mongoose");

const emailOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  number: { type: String, required: true }, // Save the phone number too
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }, // auto-delete in 5 mins
});

const EmailOtp = mongoose.model("EmailOtp", emailOtpSchema);
module.exports = EmailOtp;