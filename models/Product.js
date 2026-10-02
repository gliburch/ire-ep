const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    productNo: {
      type: Number,
      required: true,
      unique: true,
      index: true,
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
    verifiedAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// 재검증이 쓰는 정렬(verifiedAt 오래된 순)을 인덱스로 받는다.
// verifiedAt 단일 인덱스만으로는 두 번째 키(updatedAt) 때문에 정렬이 인덱스를 타지 못해
// 매 실행이 컬렉션 전체를 훑고 메모리에서 정렬한다(COLLSCAN + SORT).
productSchema.index({ verifiedAt: 1, updatedAt: 1 });

module.exports = mongoose.model('Product', productSchema, 'products');
