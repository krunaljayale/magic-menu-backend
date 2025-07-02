const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const restaurantSettlementSchema = new Schema(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Owner", required: true },

    weekStart: { type: Date, required: true }, // e.g., 20 Jun 2025 00:00
    weekEnd: { type: Date, required: true }, // e.g., 26 Jun 2025 23:59:59

    totalOrders: { type: Number, required: true },
    grossRevenue: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    taxOnCommission: { type: Number, required: true },
    netRevenue: { type: Number, required: true },

    generatedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },

    // Admin uploads payment proof
    paymentProofImageUrl: { type: String }, // URL to screenshot/image in S3, Cloudinary, etc.
    paidAt: { type: Date }, // Date when payment was made
    paidBy: { type: Schema.Types.ObjectId, ref: "Admin" }, // Who made the payment (admin ID)
    paymentMode: { type: String }, // Optional: "UPI", "Bank Transfer", etc.
    remarks: {
      type: String,
      default: "Payment will be processed by the upcoming Sunday.",
    },// Admin notes if needed
  },
  { timestamps: true }
);

// Optional index to prevent duplicates
restaurantSettlementSchema.index(
  { hotel: 1, weekStart: 1, weekEnd: 1 },
  { unique: true }
);

const RestaurantSettlement = mongoose.model(
  "RestaurantSettlement",
  restaurantSettlementSchema
);
module.exports = RestaurantSettlement;
