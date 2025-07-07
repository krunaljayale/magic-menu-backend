const mongoose = require("mongoose");

const emergencyClosureSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Owner",
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  duration: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const EmergencyClosure = mongoose.model(
  "EmergencyClosure",
  emergencyClosureSchema
);
module.exports = EmergencyClosure;
