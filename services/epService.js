const ProductMaster = require("../models/ProductMaster");

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

function buildEpFileContent(epDataList) {
  const headerRow = EP_HEADERS.join("\t");
  const dataRows = epDataList.map((epData) => productToTsvRow(epData));
  return {
    content: [headerRow, ...dataRows].join("\n"),
    count: epDataList.length,
  };
}

async function collectEpData(options = {}) {
  const {
    recentOnly = true,
    updatedFrom = null,
    updatedTo = null,
  } = options;

  const query = {};

  if (updatedFrom || updatedTo) {
    query.updated_at = {
      ...(updatedFrom ? { $gte: updatedFrom } : {}),
      ...(updatedTo ? { $lt: updatedTo } : {}),
    };
  } else if (recentOnly) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    query.updated_at = { $gte: since };
  }

  const masters = await ProductMaster.find(query).lean();

  const epDataList = [];

  for (const master of masters) {
    if (!master.epData) continue;
    epDataList.push(master.epData);
  }

  return epDataList;
}

/**
 * EP 파일 생성 단일 진입점
 * @param {object} options
 * @param {boolean} options.recentOnly
 * @param {Date|null} options.updatedFrom
 * @param {Date|null} options.updatedTo
 */
async function generateEpFile(options = {}) {
  const epDataList = await collectEpData(options);
  return buildEpFileContent(epDataList);
}

module.exports = {
  generateEpFile,
};
