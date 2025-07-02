const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ratingSchema = new Schema(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5, // Assuming a rating scale from 1 to 5
    },
    comment: { type: String },
  },
  { timestamps: true } // Automatically manage createdAt and updatedAt fields
);

const Rating = mongoose.model("Rating", ratingSchema);
module.exports = Rating;
