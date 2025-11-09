const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const liveOrderSchema = new Schema(
  {
    ticketNumber: { type: Number, required: true },
    orderOtp: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "PENDING",
        "PREPARING",
        "ACCEPTED",
        "PICKEDUP",
        "DROP",
        "DELIVERED",
        "CANCELLED",
        "REJECTED",
      ],
      default: "PENDING", // Default status set to "PENDING"
    },
    restaurantStatus: {
      type: String,
      enum: ["PREPARING", "ALMOST_READY", "READY"],
      default: "PREPARING",
    },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    hotel: { type: Schema.Types.ObjectId, ref: "Owner", required: true },
    rider: { type: Schema.Types.ObjectId, ref: "Rider" },
    riderMetaData: { type: Schema.Types.ObjectId, ref: "RiderMetaData" },
    payment: { type: Schema.Types.ObjectId, ref: "PaymentLog", required: true },
    locationIndex: { type: Number, required: true },
    items: [
      {
        item: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
        quantity: { type: Number, required: true },
      },
    ],
    remarks: { type: String },
    orderedAt: { type: Date, default: Date.now },
    preparationTime:{type:Number,default:0},
    servedAt: { type: Date },
    arrivedAt: { type: Date },
    deliveredAt: { type: Date },
    totalPrice: { type: Number, required: true },
  },
  { timestamps: true }
);

// Index for optimized queries on customer, hotel, and ticketNumber
liveOrderSchema.index({ customer: 1, hotel: 1, ticketNumber: 1 });

const LiveOrder = mongoose.model("LiveOrder", liveOrderSchema);
module.exports = LiveOrder;
