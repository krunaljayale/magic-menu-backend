const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const riderSchema = new Schema(
  {
    name: { type: String, required: true },
    number: { type: Number, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gender: { type: String, default: "Not specified" },
    dob: { type: Date, default: new Date("2000-01-01") },
    isBlocked: { type: Boolean, default: true, required:true },
    fcmToken: [String],
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    vehical: {
      type: { type: String, default: "Bike" },
      brand: { type: String, default: "Generic" },
      rtoNumber: { type: String, default: "MH271234" },
    },
    legal: {
      passportPhoto: {
        url: {
          type: String,
          default: "https://dummyimage.com/200x200/ccc/fff&text=No+Image",
        },
        filename: { type: String, default: "No Image" },
      },
      adhar: { type: Number, default: 123456789123 },
      license: { type: String, default: "Not Uploaded" },
    },
    depositAmount: { type: Number, default: 0 },
    onDuty: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    servingOrder: { type: Schema.Types.ObjectId, ref: "LiveOrder" },
    status: {
      type: String,
      enum: ["EMPTY", "ACCEPTED", "REACHED", "PICKEDUP", "DROP"],
      default: "EMPTY",
    },
  },
  { timestamps: true } // This will automatically add createdAt and updatedAt fields
);

const Rider = mongoose.model("Rider", riderSchema);
module.exports = Rider;
