const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const listingSchema = new Schema(
  {
    name: { type: String, required: true },
    originalPrice: Number, // Original price before discount
    discountedPrice: { type: Number, required: true },
    description: { type: String, required: true },
    images: {
      type: [
        {
          url: {
            type: String,
            default: "https://dummyimage.com/200x200/ccc/fff&text=No+Image",
          },
          filename: { type: String, default: "no-image" },
        },
      ],
      default: [
        {
          url: "https://dummyimage.com/200x200/ccc/fff&text=No+Image",
          filename: "no-image",
        },
      ],
    },
    isVeg: { type: Boolean, required: true },
    inStock: { type: Boolean, required: true, default: false },
    isRecommended: { type: Boolean, default: false },
    category: { type: String, required: true },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "Owner",
      required: true,
    },
    rating: { type: Number, default: 0 },
    ratingsCount: { type: Number, default: 0 },
    addOns: [
        {
          _id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Listing", // Optional: if you have an AddOn collection
          },
          name: {
            type: String,
          },
        },
      ],
  },
  { timestamps: true }
);

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;
