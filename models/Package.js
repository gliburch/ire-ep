const mongoose = require("mongoose");

// 기존(legacy) 네이버 EP 파일을 그대로 보관하는 컬렉션.
// legacy 파일에는 상품번호/일정 정보가 없어 EP 데이터만 담는다.
const packageSchema = new mongoose.Schema(
  {
    epData: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// EP 원본 id는 파일 내에서 고유하다. 재적재 시 upsert 조회 키로 쓰므로 인덱스를 둔다.
packageSchema.index({ "epData.id": 1 }, { unique: true });

module.exports = mongoose.model("Package", packageSchema, "packages");
