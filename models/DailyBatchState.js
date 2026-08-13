const mongoose = require("mongoose");

const dailyBatchStateSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

module.exports = mongoose.model("DailyBatchState", dailyBatchStateSchema, "dailyBatchStates");
