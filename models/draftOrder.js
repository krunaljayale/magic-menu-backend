const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const draftOrderSchema = new Schema(
  {
    ticketNumber: { type: Number, required: true },
    orderOtp: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "AWAITING_PAYMENT",
        "CREATING_ORDER",
        "CREATED",
        "FAILED",
        "CANCELLED",
      ],
      default: "AWAITING_PAYMENT",
    },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    hotel: { type: Schema.Types.ObjectId, ref: "Owner", required: true },
    payment: {
      type: Schema.Types.ObjectId,
      ref: "PaymentLog",
      required: true,
      unique: true,
    },
    locationIndex: { type: Number, required: true },
    items: [
      {
        item: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
        quantity: { type: Number, required: true },
      },
    ],
    remarks: { type: String },
    totalPrice: { type: Number, required: true },
  },
  { timestamps: true } // This automatically adds 'createdAt'
);

// Index for optimized queries
draftOrderSchema.index({ customer: 1, hotel: 1, ticketNumber: 1 });

// --- ADD THIS SECTION ---
// TTL Index to expire ALL documents after 24 hours
// 86400 seconds = 24 hours
draftOrderSchema.index(
  { createdAt: 1 }, // Index the 'createdAt' field
  {
    expireAfterSeconds: 86400, // Expire after 24 hours
  }
);
// --- END OF ADDED SECTION ---

const DraftOrder = mongoose.model("DraftOrder", draftOrderSchema);
module.exports = DraftOrder;
