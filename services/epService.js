const Product = require("../models/Product");

/**
 * TSV용 제어문자 제거
 * - 탭, 엔터, 기타 제어문자를 공백으로 변환
 */
function sanitizeForTsv(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/[\t\n\r\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 네이버 EP 헤더 필드 (순서 중요)
 */
const EP_HEADERS = [
  "id",
  "title",
  "price_pc",
  "benefit_price",
  "normal_price",
  "link",
  "mobile_link",
  "image_link",
  "add_image_link",
  "category_name1",
  "category_name2",
  "category_name3",
  "category_name4",
  "naver_category",
  "brand",
  "brand_certification",
  "maker",
  "origin",
  "search_tag",
  "shipping",
  "attribute",
  "gender",
];

/**
 * 상품 데이터를 TSV 행으로 변환
 */
function productToTsvRow(epData) {
  return EP_HEADERS.map((header) => sanitizeForTsv(epData[header])).join("\t");
}

/**
 * EP 파일 생성
 * - departureDate가 오늘 이후인 상품만 조회
 * - TSV 형식으로 변환하여 반환
 */
async function generateEpFile() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const products = await Product.find({
    departureDate: { $gte: today },
  }).lean();

  const headerRow = EP_HEADERS.join("\t");
  const dataRows = products
    .filter((p) => p.epData)
    .map((p) => productToTsvRow(p.epData));

  return [headerRow, ...dataRows].join("\n");
}

module.exports = {
  sanitizeForTsv,
  EP_HEADERS,
  generateEpFile,
};
