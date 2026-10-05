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

// EP 생성이 쓰는 필터(출발일이 오늘 이후)를 인덱스로 받는다.
// 없으면 EP를 만들 때마다 컬렉션 전체를 훑는다(COLLSCAN). 3만 건까지는 몇 초로
// 묻혔지만 10만 건을 넘기면서 함수 실행시간 한도를 넘겨 EP 생성이 멈췄다.
productSchema.index({ departureDate: 1 });

module.exports = mongoose.model('Product', productSchema, 'products');
