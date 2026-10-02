const Product = require("../models/Product");
const {
  getSoldoutFlags,
  describeSoldout,
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
 * 상품 데이터가 바뀌어 더는 팔 수 없게 된 경우. 문서를 지우고 changeLogs에 남긴다.
 * - 판매 종료/취소는 되돌아오지 않는 변화다. "언제 봤느냐"와 무관하게 같은 판정이 나온다
 * - 그래서 이력으로서 의미가 있다. 어느 상품이 왜 사라졌는지 나중에 되짚을 수 있다
 */
const DROP_RULES = [
  {
    code: "soldout",
    test: (result) => getSoldoutFlags(result).length > 0,
    note: (result) => describeSoldout(result),
  },
];

/**
 * 데이터는 그대로인데 때가 지나 보관할 이유가 없어진 경우. 문서는 지우되 changeLogs에는 남기지 않는다.
 * - 출발일 경과는 상품이 바뀌어서가 아니라 오늘 날짜가 흘러서 걸린다.
 *   어제는 통과하고 오늘은 걸리는 판정을 "변경 이력"에 적으면
 *   "바뀐 것"과 "때가 된 것"이 한 줄에 섞여 로그가 신호를 잃는다
 * - 지우는 이유는 보관해도 쓸 데가 없기 때문이다. EP에는 어차피 나가지 않는데
 *   재검증 대상으로는 영원히 잡혀 매일 API 호출만 쓴다
 */
const EXPIRE_RULES = [
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
 * - 판매 종료/취소(DROP_RULES)와 출발일 경과(EXPIRE_RULES) 모두 문서를 삭제하지만,
 *   changeLogs에 남는 것은 앞쪽뿐이다
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

  // 지우는 것까지는 같고 이력만 남기지 않는다. 두 경우의 차이는 콘솔 note로 구분된다.
  const expireRule = EXPIRE_RULES.find((rule) => rule.test(result));
  if (expireRule) {
    await Product.deleteOne({ _id: doc._id });
    return { status: "deleted", note: expireRule.note(result) };
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
 * - shouldStop을 주면 묶음 사이에서만 확인하고 멈춘다. 날아간 요청을 중간에
 *   끊으면 응답을 받고도 verifiedAt을 못 남겨 같은 건을 다음 실행이 또 집는다
 */
async function refreshOldestProducts(options = {}) {
  const { limit = 100, concurrency = 10, onItem, shouldStop } = options;

  const docs = await Product.find({ epData: { $exists: true, $ne: null } })
    .sort({ verifiedAt: 1, updatedAt: 1 })
    .limit(limit)
    .select("productNo epData")
    .lean();

  const results = { changed: 0, unchanged: 0, deleted: 0, failed: 0 };
  let processed = 0;
  let stoppedEarly = false;

  for (let i = 0; i < docs.length; i += concurrency) {
    if (shouldStop && shouldStop()) {
      stoppedEarly = true;
      break;
    }

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

    processed += batch.length;
  }

  return { total: docs.length, processed, stoppedEarly, results };
}

module.exports = {
  REFRESH_FIELDS,
  DROP_RULES,
  EXPIRE_RULES,
  diffRefreshFields,
  refreshProduct,
  refreshOldestProducts,
};
