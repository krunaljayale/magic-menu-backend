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
    fcmToken:[String],
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String  },
    },
    logo: {
      url: String,
      filename: String,
    },
    images: [String],
    isServing: { type: Boolean },
    chef: {
      name: { type: String, },
      number: { type: Number },
    },
    isVeg:{type:Boolean,default:false},
    categories: [{ type: String }],
    isBrand: { type: Boolean, default: false },
  },
  { timestamps: true } // This will automatically add createdAt and updatedAt fields
);

const Owner = mongoose.model("Owner", ownerSchema);
module.exports = Owner;
