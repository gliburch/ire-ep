const { EP_MAX_ITEMS } = require("../config/env");
const ProductMaster = require("../models/ProductMaster");
const { getTitleOverrides } = require("./titleOverrideService");
const { appendDepartureSuffix } = require("./scraperUtils");
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
// EP 파일 맨 앞에 붙이는 UTF-8 BOM.
// 응답에 charset이 없으면 브라우저가 바이트로 인코딩을 추측해 한글이 깨진다.
// 네이버가 받는 파일 내용에는 영향이 없고, 사람이 열어볼 때만 효과가 있다.
const UTF8_BOM = "\uFEFF";

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
    content: UTF8_BOM + [headerRow, ...dataRows].join("\n"),
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

// EP 생성에 실제로 쓰이는 epData 서브셋만 가져온다.
// 수집 단계가 저장한 brand_certification·transport_code 등 EP 출력에 안 쓰는 필드는
// 제외해 Mongo→Node 전송량을 줄인다. 데이터가 10만 건을 넘어가면서 full epData를
// 그대로 가져오는 쿼리가 Vercel 300초 안에 못 끝나 EP 생성이 밀렸다.
const EP_FETCH_PROJECTION = {
  _id: 0,
  departureDate: 1,
  "epData.id": 1,
  "epData.title": 1,
  "epData.price_pc": 1,
  "epData.benefit_price": 1,
  "epData.normal_price": 1,
  "epData.link": 1,
  "epData.mobile_link": 1,
  "epData.image_link": 1,
  "epData.add_image_link": 1,
  "epData.category_name1": 1,
  "epData.category_name2": 1,
  "epData.category_name3": 1,
  "epData.category_name4": 1,
  "epData.naver_category": 1,
  "epData.brand": 1,
  "epData.maker": 1,
  "epData.origin": 1,
  "epData.coupon": 1,
  "epData.search_tag": 1,
  "epData.shipping": 1,
  "epData.attribute": 1,
  "epData.gender": 1,
  "epData.transport_name": 1,
};

async function collectProductEpData(options = {}) {
  const { futureOnly = true } = options;
  const query = { epData: { $exists: true, $ne: null } };

  if (futureOnly) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query.departureDate = { $gte: today };
  }

  // 출발일이 빠른 순으로 EP_MAX_ITEMS건까지만 담는다. 전량을 담으면 EP 생성이
  // 함수 실행시간 한도를 넘겨 파일이 아예 만들어지지 않는다.
  // 정렬 기준이 출발일인 것은 임박한 상품을 먼저 싣는 것이 맞기도 하지만,
  // departureDate 인덱스가 필터와 정렬을 한 번에 받아 별도 정렬 단계가
  // 사라지기 때문이다. 다른 키로 정렬하면 인덱스가 둘로 갈려 풀스캔으로 돌아간다.
  const products = await Product.find(query, EP_FETCH_PROJECTION)
    .sort({ departureDate: 1 })
    .limit(EP_MAX_ITEMS)
    .lean();

  const grouped = new Map();
  for (const product of products) {
    if (!product.epData) continue;
    const title = appendDepartureSuffix(
      product.epData.title,
      product.departureDate,
      product.epData.transport_name,
    );
    const row = { ...product.epData, title };
    if (!grouped.has(title)) grouped.set(title, []);
    grouped.get(title).push(row);
  }

  const included = [];
  const excluded = [];
  for (const rows of grouped.values()) {
    included.push(rows[0]);
    if (rows.length > 1) excluded.push(...rows);
  }

  return { included, excluded };
}

/**
 * Product 기반 EP 파일 생성 단일 진입점
 *
 * 네이버 EP 정책상 같은 제목의 상품이 섞여 올라가면 계정 정지 위험이 있어,
 * 가격·출발일·항공사 등을 제목에 섞어 최대한 분기를 만든다.
 * 그래도 제목이 겹치면 EP에 올리지 않고 excluded 파일로 뺀다(검수용).
 */
async function generateProductEpFile(options = {}) {
  const { included, excluded } = await collectProductEpData(options);
  const main = await buildEpFileContent(included);
  const excludedFile = await buildEpFileContent(excluded);
  return { main, excluded: excludedFile };
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
  buildEpFileContent,
  generateEpFile,
  generateProductEpFile,
  generatePackageEpFile,
};
