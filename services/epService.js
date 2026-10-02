const ProductMaster = require("../models/ProductMaster");
const { getTitleOverrides } = require("./titleOverrideService");
const Product = require("../models/Product");
const Package = require("../models/Package");

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
 * 네이버 EP 헤더 필드 49컬럼 (순서 중요)
 * - 네이버에 등록된 EP 포맷이므로 모든 EP 파일이 이 순서를 그대로 따른다
 * - 수집 단계의 epData가 채우지 않는 컬럼은 빈 값으로 출력한다
 */
const EP_HEADERS = [
  "id",
  "title",
  "price_pc",
  "price_mobile",
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
  "naver_product_id",
  "condition",
  "import_flag",
  "parallel_import",
  "order_made",
  "product_flag",
  "adult",
  "goods_type",
  "barcode",
  "manufacture_define_number",
  "model_number",
  "brand",
  "maker",
  "origin",
  "card_event",
  "event_words",
  "coupon",
  "partner_coupon_download",
  "interest_free_event",
  "point",
  "installation_costs",
  "search_tag",
  "group_id",
  "vendor_id",
  "coordi_id",
  "minimum_purchase_quantity",
  "review_count",
  "shipping",
  "delivery_grade",
  "delivery_detail",
  "attribute",
  "option_detail",
  "seller_id",
  "age_group",
  "gender",
];

/**
 * EP 헤더명과 epData 키가 다른 필드의 대응표
 * - 수집 단계는 최신 필드명으로 저장하고, 출력은 네이버에 등록된 49컬럼 이름을 쓴다
 */
const EP_FIELD_ALIASES = {
  price_mobile: "benefit_price",
};

/**
 * 헤더에 해당하는 값을 epData에서 꺼낸다(별칭 포함)
 */
function readEpField(epData, header) {
  if (epData[header] !== undefined) {
    return epData[header];
  }

  const alias = EP_FIELD_ALIASES[header];
  return alias ? epData[alias] : "";
}

/**
 * 상품 데이터를 TSV 행으로 변환
 */
function productToTsvRow(epData, headers = EP_HEADERS) {
  return headers.map((header) => sanitizeForTsv(readEpField(epData, header))).join("\t");
}

/**
 * epData 목록을 EP 파일 내용으로 만든다.
 * - 제목 덮어쓰기 시트에 id가 있으면 그 title로 바꿔 출력한다
 * - 시트 제목은 sanitizeTitle을 타지 않는다(수동 값을 그대로 쓰는 것이 목적)
 */
async function buildEpFileContent(epDataList, headers = EP_HEADERS) {
  const overrides = await getTitleOverrides();
  const matchedIds = new Set();

  const headerRow = headers.join("\t");
  const dataRows = epDataList.map((epData) => {
    const overriddenTitle = overrides.get(epData.id);
    if (!overriddenTitle) {
      return productToTsvRow(epData, headers);
    }
    matchedIds.add(epData.id);
    return productToTsvRow({ ...epData, title: overriddenTitle }, headers);
  });

  // 시트에 있지만 EP 대상에 없는 id는 오타일 수 있어 따로 알린다.
  const unmatchedIds = [...overrides.keys()].filter((id) => !matchedIds.has(id));

  if (overrides.size > 0) {
    console.log(`\x1b[90m[ep]\x1b[0m 제목 덮어쓰기 ${matchedIds.size}건 적용 (시트 ${overrides.size}건)`);
  }
  if (unmatchedIds.length > 0) {
    console.log(`\x1b[33m[ep]\x1b[0m 미매칭 id ${unmatchedIds.length}건: ${unmatchedIds.join(", ")}`);
  }

  return {
    content: [headerRow, ...dataRows].join("\n"),
    count: epDataList.length,
    overriddenCount: matchedIds.size,
    unmatchedOverrideIds: unmatchedIds,
  };
}

/**
 * ProductMaster에서 EP 파일에 포함할 epData만 수집한다.
 * - updatedFrom이 있으면 해당 시점 이후로 updated_at 범위를 제한
 * - updatedFrom이 없으면 전체 epData를 수집
 */
async function collectEpData(options = {}) {
  const { updatedFrom = null } = options;
  const query = {};

  if (updatedFrom) {
    query.updated_at = { $gte: updatedFrom };
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
 * ProductMaster 기반 EP 파일 생성 단일 진입점
 * @param {object} options
 * @param {Date|null} options.updatedFrom
 */
async function generateEpFile(options = {}) {
  const epDataList = await collectEpData(options);
  return buildEpFileContent(epDataList);
}

/**
 * Product(출발일 단위)에서 EP 파일에 포함할 epData를 수집한다.
 * - futureOnly가 true이면 오늘 이후 출발 상품만 포함
 */
async function collectProductEpData(options = {}) {
  const { futureOnly = true } = options;
  const query = { epData: { $exists: true, $ne: null } };

  if (futureOnly) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query.departureDate = { $gte: today };
  }

  const products = await Product.find(query, { epData: 1, _id: 0 }).lean();

  const epDataList = [];

  for (const product of products) {
    if (!product.epData) continue;
    epDataList.push(product.epData);
  }

  return epDataList;
}

/**
 * Product 기반 EP 파일 생성 단일 진입점
 * @param {object} options
 * @param {boolean} options.futureOnly
 */
async function generateProductEpFile(options = {}) {
  const epDataList = await collectProductEpData(options);
  return buildEpFileContent(epDataList);
}

/**
 * Package(기존 EP 원본)에서 epData를 수집한다.
 * - 원본 컬럼 구조를 그대로 보관하므로 별도 가공 없이 반환
 */
async function collectPackageEpData() {
  const packages = await Package.find({
    epData: { $exists: true, $ne: null },
  }).lean();

  const epDataList = [];

  for (const pkg of packages) {
    if (!pkg.epData) continue;
    epDataList.push(pkg.epData);
  }

  return epDataList;
}

/**
 * Package 기반 EP 파일 생성 단일 진입점
 */
async function generatePackageEpFile() {
  const epDataList = await collectPackageEpData();
  return buildEpFileContent(epDataList);
}

module.exports = {
  EP_HEADERS,
  sanitizeForTsv,
  buildEpFileContent,
  generateEpFile,
  generateProductEpFile,
  generatePackageEpFile,
};
