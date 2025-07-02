const mongoose = require("mongoose");

const connectDB = (url) => {
  console.log('Connected to DataBase')
  return mongoose.connect(url);
};

module.exports = connectDB;
