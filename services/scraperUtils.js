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
 * 네이버 EP 상품명 최대 길이 (글자 단위)
 */
const TITLE_MAX_LENGTH = 100;

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
  return sanitized.slice(0, TITLE_MAX_LENGTH);
}

/**
 * 출발일을 제목 접미사 문자열로 만든다.
 * - DB의 departureDate는 현지 날짜를 UTC 자정으로 저장하므로 UTC 기준으로 읽는다.
 *   로컬 타임존으로 읽으면 한국 외 타임존에서 하루 밀린다
 * @returns {string} 예: "2026년 10월 3일 출발" (날짜가 없거나 깨지면 빈 문자열)
 */
function formatDepartureSuffix(value) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 출발`;
}

/**
 * 정제된 제목 뒤에 출발일/항공사 접미사를 붙인다.
 * - sanitizeTitle은 특수문자를 지우므로 반드시 정제 이후에 붙여야 한다
 * - 100자를 넘으면 접미사를 살리고 제목 쪽을 자른다.
 *   잘린 제목은 사람이 읽어 보완할 수 있지만, 출발일이 빠진 제목은
 *   같은 상품의 다른 출발일 행과 구별되지 않아 EP에서 더 치명적이다
 * - 예) "(제목). 2027년 9월 12일 출발. 대한항공"
 */
function appendDepartureSuffix(title, value, airline = "") {
  const departure = formatDepartureSuffix(value);
  const parts = [departure, airline].filter(Boolean);
  if (parts.length === 0) {
    return title;
  }

  const tail = parts.map((p) => `. ${p}`).join("");
  const room = TITLE_MAX_LENGTH - tail.length;

  return `${String(title).slice(0, Math.max(0, room)).trim()}${tail}`;
}

/**
 * 딜레이 헬퍼
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  TITLE_MAX_LENGTH,
  sanitizeId,
  sanitizeTitle,
  formatDepartureSuffix,
  appendDepartureSuffix,
  sleep,
};
