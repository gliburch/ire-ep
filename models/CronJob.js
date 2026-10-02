const mongoose = require("mongoose");

// 크론으로 돌리는 작업 종류. 로그·대시보드·changeLog 연결에서 같은 값을 쓴다.
// 대상 엔터티를 값에 포함해, 다른 엔터티 작업이 늘어도 구분이 유지되게 한다.
const CRON_JOB_TYPES = {
  PRODUCT_COLLECT: "Product 수집",
  PRODUCT_CHANGE_TRACK: "Product 변경 추적",
};

/**
 * 크론 1회 실행 기록. 어떤 작업이 언제 어디서 어디까지 돌았는지만 남긴다.
 * - 상세 결과는 DB에 쌓지 않는다(실행 로그로 본다)
 * - 나중에 changeLog에서 "어느 실행의 결과인지" 가리킬 수 있도록 _id만 제공한다
 */
const cronJobSchema = new mongoose.Schema(
  {
    job: {
      type: String,
      enum: Object.values(CRON_JOB_TYPES),
      required: true,
      index: true,
    },
    // 번호 구간으로 진행하는 작업에서만 쓴다(그 외에는 null).
    startNo: {
      type: Number,
      default: null,
    },
    // 실제로 훑고 끝낸 마지막 번호. 다음 실행이 이어받는 기준이다.
    // productNo가 수천 개씩 비어 있는 구간이 실재하므로(저장 0건이면 최대
    // productNo가 늘지 않는다) 진행 지점을 번호로 남겨야 전진이 멈추지 않는다.
    lastNo: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 같은 작업이 같은 구간을 두 번 집지 못하게 막는다.
// 서버리스에서는 크론이 겹쳐 떠도 모듈 전역 플래그로 막을 수 없으므로,
// 이 unique 제약이 "구간 선점"의 역할을 한다.
// 구간이 없는 작업은 startNo가 null이라 제약 대상에서 빠진다.
cronJobSchema.index(
  { job: 1, startNo: 1 },
  {
    unique: true,
    partialFilterExpression: { startNo: { $type: "number" } },
  },
);

const CronJob = mongoose.model("CronJob", cronJobSchema, "cronJobs");

module.exports = CronJob;
module.exports.CRON_JOB_TYPES = CRON_JOB_TYPES;
