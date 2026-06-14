const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    productNo: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
    },
    epData: {
      type: mongoose.Schema.Types.Mixed,
    },
    departureDate: {
      type: Date,
    },
    arrivalDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Product', productSchema, 'products');
