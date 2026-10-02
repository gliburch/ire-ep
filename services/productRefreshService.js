const Product = require("../models/Product");
const {
  getSoldoutFlags,
  isDeparted,
  fetchProductFromApi,
} = require("./productScraperService");
const { sanitizeTitle } = require("./scraperUtils");
const { describeChanges, recordChange } = require("./changeLogService");

/**
 * 재검증 시 최신값으로 덮어쓸 epData 필드.
 * - 확인할 항목이 늘어나면 이 표에만 추가한다
 * - 이미지(image_link/add_image_link)는 의도적으로 제외한다.
 *   상세 응답의 원본 URL로 덮어쓰면 FTP에 올려둔 EP용 이미지 링크가 깨진다.
 */
const REFRESH_FIELDS = {
  price_pc: (result) => result.benefitPriceInfo?.price || 1,
  benefit_price: (result) => result.benefitPriceInfo?.discountPrice || 1,
  normal_price: (result) => result.productPriceAdultTotalAmount || 1,
  title: (result) =>
    sanitizeTitle(
      result.departureDate
        ? `${result.productName || ""} ${result.departureDate} 출발`
        : result.productName || "",
    ),
  coupon: (result) => (result.badges?.existsCoupon ? "Y" : ""),
};

/**
 * 하나라도 걸리면 상품을 DB에서 지우는 조건.
 * - 수집 단계와 같은 기준이다. 저장해 둘 이유가 없는 상품은 남기지 않는다
 * - 삭제 사유는 문서가 아니라 changeLogs에 한글로 남는다
 */
const DROP_RULES = [
  {
    code: "soldout",
    test: (result) => getSoldoutFlags(result).length > 0,
    note: (result) => `판매 종료 (${getSoldoutFlags(result).join(", ")})`,
  },
  {
    code: "departed",
    test: (result) => isDeparted(result),
    note: (result) => `출발일 경과 (${result.departureDate} 출발)`,
  },
];

/**
 * 값이 비어 있는지 본다.
 * - 수집 단계는 쿠폰이 없으면 키 자체를 넣지 않아 undefined가 되는데,
 *   재검증은 빈 문자열을 돌려준다. 이 둘을 다른 값으로 보면 매 실행마다
 *   변경이 없는 상품까지 전부 바뀐 것으로 잡힌다.
 */
function isBlank(value) {
  return value === undefined || value === null || value === "";
}

/**
 * 재검증 결과 바뀐 필드만 뽑는다.
 * - 값이 같으면 epData를 건드리지 않아 불필요한 쓰기를 막는다
 */
function diffRefreshFields(result, epData) {
  const previous = epData || {};
  const changes = {};

  for (const [field, extract] of Object.entries(REFRESH_FIELDS)) {
    const next = extract(result);
    const before = previous[field];

    if (isBlank(before) && isBlank(next)) continue;
    if (next !== before) {
      changes[field] = { from: before, to: next };
    }
  }

  return changes;
}

/**
 * 저장된 상품 하나를 상세 API로 재검증한다.
 * - 이미지 FTP를 거치지 않으므로 신규 수집보다 훨씬 싸다
 * - 판매 종료/출발 경과는 문서를 삭제한다
 */
async function refreshProduct(doc) {
  const apiResponse = await fetchProductFromApi(doc.productNo);
  const result = apiResponse.result || {};

  const dropRule = DROP_RULES.find((rule) => rule.test(result));
  if (dropRule) {
    const note = dropRule.note(result);
    await Product.deleteOne({ _id: doc._id });
    await recordChange({
      entity: "product",
      documentId: doc._id,
      refKey: doc.productNo,
      action: "deleted",
      note,
    });
    return { status: "deleted", note };
  }

  const changes = diffRefreshFields(result, doc.epData);
  const update = { verifiedAt: new Date() };

  if (result.departureDate) update.departureDate = new Date(result.departureDate);
  if (result.arrivalDate) update.arrivalDate = new Date(result.arrivalDate);

  for (const [field, { to }] of Object.entries(changes)) {
    update[`epData.${field}`] = to;
  }

  await Product.updateOne({ _id: doc._id }, { $set: update });

  // 값이 그대로인 건은 기록하지 않는다. 전부 남기면 로그가 신호를 잃는다.
  if (Object.keys(changes).length === 0) {
    return { status: "unchanged", changes };
  }

  await recordChange({
    entity: "product",
    documentId: doc._id,
    refKey: doc.productNo,
    action: "updated",
    note: describeChanges(changes),
    changes,
  });

  return { status: "changed", changes };
}

/**
 * verifiedAt이 오래된 순으로 limit개를 재검증한다.
 * - 범위를 호출측이 정하지 않으므로 중단 후 다시 실행하면 자연히 이어진다
 * - concurrency개씩 묶어 병렬 요청한다(이미지 업로드가 없어 순차일 이유가 없다)
 */
async function refreshOldestProducts(options = {}) {
  const { limit = 100, concurrency = 10, onItem } = options;

  const docs = await Product.find({ epData: { $exists: true, $ne: null } })
    .sort({ verifiedAt: 1, updatedAt: 1 })
    .limit(limit)
    .select("productNo epData")
    .lean();

  const results = { changed: 0, unchanged: 0, deleted: 0, failed: 0 };

  for (let i = 0; i < docs.length; i += concurrency) {
    const batch = docs.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((doc) => refreshProduct(doc)),
    );

    settled.forEach((outcome, index) => {
      const doc = batch[index];
      const current = i + index + 1;

      if (outcome.status === "fulfilled") {
        results[outcome.value.status]++;
        if (onItem) onItem({ current, total: docs.length, doc, ...outcome.value });
      } else {
        results.failed++;
        if (onItem) {
          onItem({
            current,
            total: docs.length,
            doc,
            status: "failed",
            error: outcome.reason,
          });
        }
      }
    });
  }

  return { total: docs.length, results };
}

module.exports = {
  REFRESH_FIELDS,
  DROP_RULES,
  diffRefreshFields,
  refreshProduct,
  refreshOldestProducts,
};
