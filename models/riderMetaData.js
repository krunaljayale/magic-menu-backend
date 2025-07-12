const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const riderMetaDataSchema = new Schema(
  {
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    acceptedAtLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    acceptedAtTime: {
      type: Date,
      required: true,
    },
    restaurantDistanceAtAccept: {
      type: Number,
      required: true,
    },
    customerDistanceAtAccept: {
      type: Number,
      required: true,
    },
    selfieAtRestaurant: {
      type: String,
    },
    reachedRestaurantAt: {
      type: Date,
    },
    pickupConfirmedAt: {
      type: Date,
    },
    dropAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const RiderMetaData = mongoose.model("RiderMetaData", riderMetaDataSchema);
module.exports = RiderMetaData;
