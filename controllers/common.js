const Category = require("../models/category");

module.exports.category = async (req, res) => {
  let category = await Category.find();
  res.send(category);
};


module.exports.auth = async (req, res) => {
  res.status(200).json({ message:'User is Logged in' });
};