const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const categorySchema = new Schema(
  {
    name:{type:String , required:true},
    image:{
        url: String,
        filename: String,
      }
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
