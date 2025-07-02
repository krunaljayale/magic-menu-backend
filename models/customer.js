const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const customerSchema = new Schema(
  {
    name: { type: String, required: true },
    number: { type: Number, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    gender: { type: String },
    fcmToken: [String],
    notificationsEnabled: { type: Boolean, default: true },
    location: [
      {
        title: { type: String, required: true },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        houseNo: { type: Number, required: true },
        buildingNo: { type: String, required: true },
        landmark: { type: String, required: false },
        isDefault: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

const Customer = mongoose.model("Customer", customerSchema);
module.exports = Customer;
