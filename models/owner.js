const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ownerSchema = new Schema(
  {
    name: { type: String, required: true },
    number: { type: String, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    hotel: { type: String },
    description: { type: String },
    fcmToken: [String],
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    },
    logo: {
      url: String,
      filename: String,
    },
    images: [String],
    isServing: { type: Boolean, default: false },
    chef: {
      name: { type: String },
      number: { type: Number },
    },
    isVeg: { type: Boolean, default: false },
    isCODAvailable: { type: Boolean, default: false },
    freeDeliveryMOV: { type: Number, default: 300 },
    categories: [{ type: String }],
    isBrand: { type: Boolean, default: false },
    commissionRate: {
      type: Number,
      required: true,
      default: 0.2,
      min: 0,
      max: 1,
    },
    gstRate: {
      type: Number,
      required: true,
      default: 0.18,
      min: 0,
      max: 1,
    },
    autoScheduleEnabled: { type: Boolean, default: false },
    weeklySchedule: {
      monday: {
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
      tuesday: {
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
      wednesday: {
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
      thursday: {
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
      friday: {
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
      saturday: {
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
      sunday: {
        open: { type: String, default: null },
        close: { type: String, default: null },
      },
    },
  },
  { timestamps: true } // This will automatically add createdAt and updatedAt fields
);

const Owner = mongoose.model("Owner", ownerSchema);
module.exports = Owner;
