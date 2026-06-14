const mongoose = require("mongoose");

const batchJobSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    masterCodes: {
      type: [String],
      default: [],
    },
    completedBatches: {
      type: [String],
      default: [],
    },
    stats: {
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

module.exports = mongoose.model("BatchJob", batchJobSchema, "batchJobs");
