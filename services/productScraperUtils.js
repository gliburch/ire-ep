const TITLE_BRAND_TERMS = [
  "모두투어",
  "모두 투어",
  "modetour",
  "이레투어클럽",
  "이레투어",
];

/**
 * 네이버 EP 상품 ID 정제
 * - 영문, 숫자, -(hyphen), _(underscore), 공백만 허용
 * - 최대 50자
 */
function sanitizeId(value) {
  if (!value) {
    throw new Error("상품 ID가 없습니다");
  }
  const sanitized = String(value).replace(/[^a-zA-Z0-9\-_ ]/g, "");
  if (!sanitized) {
    throw new Error("유효한 상품 ID가 없습니다");
  }
  return sanitized.slice(0, 50);
}

/**
 * 네이버 EP 상품명 정제
 * - 제어문자(탭, 엔터 등) 제거
 * - 연속 공백 정리
 * - 최대 100자 (글자 단위)
 */
function sanitizeTitle(value) {
  if (!value) {
    throw new Error("상품명이 없습니다");
  }
  const withoutBrands = TITLE_BRAND_TERMS.reduce(
    (title, brand) => title.replace(new RegExp(brand, "gi"), " "),
    String(value),
  );
  const sanitized = withoutBrands
    .replace(/[\t\n\r\x00-\x1F\x7F]/g, " ")
    .replace(/[\[\]【】]/g, " ")
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) {
    throw new Error("유효한 상품명이 없습니다");
  }
  return sanitized.slice(0, 100);
}

/**
 * 딜레이 헬퍼
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GNB 트리 순회 헬퍼
 */
function walkGnbTree(value, path, visit) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkGnbTree(item, path, visit);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const nextPath = value.gnbCategoryName
    ? [...path, value.gnbCategoryName]
    : path;

  visit(value, nextPath);

  for (const childValue of Object.values(value)) {
    if (childValue && typeof childValue === "object") {
      walkGnbTree(childValue, nextPath, visit);
    }
  }
}

module.exports = {
  sanitizeId,
  sanitizeTitle,
  sleep,
  walkGnbTree,
};
