const mongoose = require("mongoose");

const productMasterSchema = new mongoose.Schema(
  {
    masterCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    masterCodeNo: {
      type: Number,
      index: true,
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
    },
    epData: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("ProductMaster", productMasterSchema, "productMasters");
