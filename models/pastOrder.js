const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const pastOrderSchema = new Schema(
  {
    ticketNumber: { type: Number, required: true },
    orderOtp: { type: Number, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: ["DELIVERED", "CANCELLED", "REJECTED"],
      required: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    hotel: {
      type: Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
    },
    rider: {
      type: Schema.Types.ObjectId,
      ref: "Rider",
    },
    riderMetaData: { type: Schema.Types.ObjectId, ref: "RiderMetaData" },
    payment: { type: Schema.Types.ObjectId, ref: "PaymentLog", required: true },
    deliveryAddress: {
      title: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
      houseNo: { type: Number },
      buildingNo: { type: String },
      landmark: { type: String },
    },
    items: [
      {
        listingId: { type: Schema.Types.ObjectId, ref: "Listing" },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    remarks: { type: String },
    orderedAt: { type: Date, default: Date.now },
    servedAt: { type: Date },
    arrivedAt: { type: Date },
    deliveredAt: { type: Date },
    totalPrice: { type: Number, required: true },
  },
  { timestamps: true }
);

// Optional index for faster search on past orders
pastOrderSchema.index({ customer: 1, hotel: 1, ticketNumber: 1 });

const PastOrder = mongoose.model("PastOrder", pastOrderSchema);
module.exports = PastOrder;
