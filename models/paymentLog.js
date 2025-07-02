const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const paymentLogSchema = new Schema({
  transactionId: {
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
    enum: ["PENDING", "SUCCESS", "FAILURE", "NOT_COLLECTED"],
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
  responsePayload: Object,
  isSettled: { type: Boolean, default: false },
  settledAt: { type: Date },
  settledBy: { type: Schema.Types.ObjectId, ref: "Admin" }, // ✅ new field added
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const PaymentLog = mongoose.model("PaymentLog", paymentLogSchema);
module.exports = PaymentLog;
