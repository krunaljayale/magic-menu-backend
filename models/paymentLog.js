const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const paymentLogSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
  },
  merchantUserId: {
    type: String,
    required: true,
    unique: true,
  },
  mode: {
    type: String,
    enum: ["COD", "ONLINE"],
    required: true,
  },
  status: {
    type: String,
    enum: [
      "PENDING",
      "SUCCESS",
      "FAILURE",
      "NOT_COLLECTED",
    ],
    required: true,
  },
  customer: {
    type: Schema.Types.ObjectId,
    ref: "Customer",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  amountInPaise: {
    type: Number,
  },

  // ✅ NEW: PhonePe-specific metadata
  phonepeOrderId: { type: String }, // from PhonePe response
  phonepeToken: { type: String }, // order token returned to RN
  phonepeState: { type: String }, // CREATED / PENDING / SUCCESS

  // responsePayload: Object, // can still hold raw API response

  isSettled: { type: Boolean, default: false },
  settledAt: { type: Date },
  settledBy: { type: Schema.Types.ObjectId, ref: "Admin" },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const PaymentLog = mongoose.model("PaymentLog", paymentLogSchema);
module.exports = PaymentLog;
