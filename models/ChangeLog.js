const mongoose = require('mongoose');

const changeLogSchema = new mongoose.Schema(
  {
    // 어떤 콜렉션의 기록인지
    entity: {
      type: String,
      required: true,
      enum: ['product', 'productMaster', 'package'],
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    // productNo / masterCode 같은 자연키.
    // 문서가 삭제되면 documentId는 가리킬 대상이 없어지므로 추적은 이 값으로 한다.
    // productNo는 숫자, masterCode는 문자열이라 String으로 통일한다.
    refKey: {
      type: String,
      required: true,
    },
    // 쿼리 조건으로 쓰는 값이라 영어로 둔다. 사람이 읽는 설명은 note가 맡는다.
    // 신규 생성은 문서의 createdAt으로 알 수 있어 기록하지 않는다.
    action: {
      type: String,
      required: true,
      enum: ['updated', 'deleted'],
    },
    // 무엇이 왜 바뀌었는지 한 줄로 적은 한글 설명
    note: {
      type: String,
    },
    // { price_pc: { from, to } } 형태의 변경 상세
    changes: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// 개별 상품 이력 추적
changeLogSchema.index({ refKey: 1, createdAt: -1 });
// 일별 리포트 + 90일 후 자동 만료
changeLogSchema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('ChangeLog', changeLogSchema, 'changeLogs');
