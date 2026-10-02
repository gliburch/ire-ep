const ChangeLog = require("../models/ChangeLog");

// note를 한글로 쓰기 위한 필드명 대응표.
// 표에 없는 필드는 원래 이름을 그대로 쓴다.
const FIELD_LABELS = {
  price_pc: "판매가",
  benefit_price: "할인가",
  normal_price: "정상가",
  title: "제목",
  coupon: "쿠폰",
};

function labelOf(field) {
  return FIELD_LABELS[field] || field;
}

/**
 * 변경 내역을 한글 한 줄로 요약한다.
 * - 예) "판매가 849000 → 869000, 쿠폰  → Y"
 */
function describeChanges(changes) {
  return Object.entries(changes || {})
    .map(([field, { from, to }]) => `${labelOf(field)} ${from} → ${to}`)
    .join(", ");
}

/**
 * 수정/삭제 기록을 남긴다.
 * - 로그 저장 실패가 본 작업을 되돌리게 하면 안 되므로 에러를 삼키고 경고만 남긴다
 */
async function recordChange({ entity, documentId, refKey, action, note, changes }) {
  try {
    await ChangeLog.create({
      entity,
      documentId,
      refKey: String(refKey),
      action,
      note,
      changes,
    });
  } catch (error) {
    console.warn(
      `\x1b[33m[changeLog]\x1b[0m 기록 실패 (${entity}/${refKey}): ${error.message}`,
    );
  }
}

module.exports = {
  FIELD_LABELS,
  describeChanges,
  recordChange,
};
