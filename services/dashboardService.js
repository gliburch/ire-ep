const path = require("path");
const fs = require("fs");
const Product = require("../models/Product");
const ProductMaster = require("../models/ProductMaster");
const ChangeLog = require("../models/ChangeLog");
const Package = require("../models/Package");
const CronJob = require("../models/CronJob");
const { CRON_JOB_TYPES } = CronJob;
const { EP_FILENAME, CRON_TIMEZONE } = require("../config/env");
const { formatDepartureSuffix } = require("./scraperUtils");

// 날짜 필터는 운영 기준 시간대(기본 Asia/Seoul)의 하루 경계로 해석한다.
const TIMEZONE_OFFSETS = {
  "Asia/Seoul": "+09:00",
  UTC: "+00:00",
};

const DIST_DIR = path.resolve(__dirname, "../dist");

// 상단 개괄 정보에 노출할 EP 파일 목록.
// 운영 EP(네이버에 등록된 주소)를 첫 번째로 둔다.
const EP_FILES = [
  { name: EP_FILENAME, label: "운영 EP (네이버 등록)" },
  { name: "ire_naver_ep.products.txt", label: "Product 기준 EP" },
  { name: "ire_naver_ep.productMasters.txt", label: "ProductMaster 기준 EP" },
];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function getTimezoneOffset() {
  return TIMEZONE_OFFSETS[CRON_TIMEZONE] || "+09:00";
}

/**
 * YYYY-MM-DD 문자열을 해당 날짜의 [시작, 끝) 구간으로 변환한다.
 * - 형식이 어긋나면 null을 반환해 필터를 적용하지 않는다
 */
function buildDateRange(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;

  const offset = getTimezoneOffset();
  const start = new Date(`${dateKey}T00:00:00.000${offset}`);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { $gte: start, $lt: end };
}

/**
 * 목록에 필요한 최소 정보만 남기고 평탄화한다.
 */
function toListItem(product) {
  const epData = product.epData || {};

  return {
    productNo: product.productNo,
    title: epData.title || "(제목 없음)",
    // EP에 나갈 제목은 여기에 접미사가 붙은 모양이다. 화면도 같은 함수로 만들어 둘이 어긋나지 않게 한다.
    departureSuffix: formatDepartureSuffix(product.departureDate),
    price: epData.price_pc || epData.benefit_price || "",
    link: epData.link || "",
    imageLink: epData.image_link || "",
    departureDate: product.departureDate || null,
    arrivalDate: product.arrivalDate || null,
    createdAt: product.createdAt || null,
    updatedAt: product.updatedAt || null,
    verifiedAt: product.verifiedAt || null,
  };
}

/**
 * 최근 수집/업데이트 목록을 페이지 단위로 조회한다.
 * @param {object} options
 * @param {"created"|"updated"} options.sort 정렬·필터 기준 필드
 * @param {string} [options.date] YYYY-MM-DD. 지정하면 해당 날짜 건만 조회
 * @param {number} [options.page] 1부터 시작
 * @param {number} [options.pageSize]
 */
async function getProductFeed(options = {}) {
  const { sort = "created", date, page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;

  const sortField = sort === "updated" ? "updatedAt" : "createdAt";
  const safePageSize = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number(page) || 1, 1);

  const query = {};
  const range = buildDateRange(date);
  if (range) {
    query[sortField] = range;
  }

  const [total, products] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query)
      .sort({ [sortField]: -1, _id: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .lean(),
  ]);

  return {
    items: products.map(toListItem),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    sort: sortField,
    date: range ? date : null,
  };
}

/**
 * 변경 기록 한 건을 목록용으로 평탄화한다.
 * - changes는 가공하지 않고 원본 그대로 넘긴다(화면에서 JSON으로 그대로 보여준다)
 */
function toChangeLogItem(log) {
  return {
    id: String(log._id),
    entity: log.entity,
    refKey: log.refKey,
    action: log.action,
    note: log.note || "",
    changes: log.changes || null,
    createdAt: log.createdAt || null,
  };
}

/**
 * 수정/삭제 기록을 페이지 단위로 조회한다.
 * - Product 문서는 삭제되면 사라지므로, 무엇이 왜 바뀌었는지는 이 콜렉션으로만 볼 수 있다
 * @param {object} options
 * @param {string} [options.date] YYYY-MM-DD. 지정하면 해당 날짜 건만 조회
 * @param {number} [options.page] 1부터 시작
 * @param {number} [options.pageSize]
 */
async function getChangeLogFeed(options = {}) {
  const { date, page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;

  const safePageSize = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(Number(page) || 1, 1);

  const query = {};
  const range = buildDateRange(date);
  if (range) {
    query.createdAt = range;
  }

  const [total, logs] = await Promise.all([
    ChangeLog.countDocuments(query),
    ChangeLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize)
      .lean(),
  ]);

  return {
    items: logs.map(toChangeLogItem),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    date: range ? date : null,
  };
}

/**
 * EP 파일별 공개 주소와 로컬 산출물 상태를 모은다.
 * - 로컬 dist에 파일이 없으면 주소만 제공한다
 */
function getEpFiles() {
  const baseUrl = (process.env.FTP_BASE_URL || "").replace(/\/$/, "");

  return EP_FILES.map(({ name, label }) => {
    const localPath = path.join(DIST_DIR, name);
    const stat = fs.existsSync(localPath) ? fs.statSync(localPath) : null;

    return {
      name,
      label,
      url: baseUrl ? `${baseUrl}/ep/${name}` : "",
      localSize: stat ? stat.size : null,
      localModifiedAt: stat ? stat.mtime : null,
    };
  });
}

/**
 * 대시보드 상단에 노출할 개괄 정보를 모은다.
 */
async function getSummary() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    productCount,
    productWithEpCount,
    futureProductCount,
    productMasterCount,
    packageCount,
    latestCreated,
    latestUpdated,
    latestCollectJob,
  ] = await Promise.all([
    Product.countDocuments({}),
    Product.countDocuments({ epData: { $exists: true, $ne: null } }),
    Product.countDocuments({
      epData: { $exists: true, $ne: null },
      departureDate: { $gte: today },
    }),
    ProductMaster.countDocuments({}),
    Package.countDocuments({}),
    Product.findOne({}).sort({ createdAt: -1 }).select("createdAt").lean(),
    Product.findOne({}).sort({ updatedAt: -1 }).select("updatedAt").lean(),
    CronJob.findOne({ job: CRON_JOB_TYPES.PRODUCT_COLLECT }).sort({ created_at: -1 }).lean(),
  ]);

  return {
    counts: {
      products: productCount,
      productsWithEp: productWithEpCount,
      // 오늘 이후 출발 = 실제 EP 파일에 실리는 모수
      epCandidates: futureProductCount,
      productMasters: productMasterCount,
      packages: packageCount,
    },
    latestCollectedAt: latestCreated?.createdAt || null,
    latestUpdatedAt: latestUpdated?.updatedAt || null,
    latestCronJob: latestCollectJob
      ? {
          job: latestCollectJob.job,
          startNo: latestCollectJob.startNo || null,
          lastNo: latestCollectJob.lastNo || null,
          ranAt: latestCollectJob.created_at || null,
        }
      : null,
    epFiles: getEpFiles(),
    timezone: CRON_TIMEZONE,
    generatedAt: new Date(),
  };
}

module.exports = {
  getSummary,
  getProductFeed,
  getChangeLogFeed,
  getEpFiles,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
};
