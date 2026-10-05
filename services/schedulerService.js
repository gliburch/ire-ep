const { EP_FILENAME, EP_FILENAME_EXCLUDED } = require("../config/env");
const Product = require("../models/Product");
const CronJob = require("../models/CronJob");
const { CRON_JOB_TYPES } = CronJob;
const { scrapeProducts } = require("./productScraperService");
const { getProductMasterSearchTargets } = require("./searchTargetService");
const { scrapeAllProductMasters } = require("./productMasterScraperService");
const { refreshOldestProducts } = require("./productRefreshService");
const { generateProductEpFile } = require("./epService");
const { uploadEpFileToFtp } = require("./ftpService");

// 크론 1회가 수집할 상품 개수.
const BATCH_SIZE = 300;

// 재검증 크론 1회가 다룰 상품 수와 동시 요청 수.
const REFRESH_BATCH_SIZE = 5000;
const REFRESH_CONCURRENCY = 20;

// 크론이 겹쳐 떠도 같은 구간을 두 번 재검증하지 않도록 보는 창.
// 시간당 4회로 촘촘해졌으므로 짧게 잡는다. 길면 정상 실행까지 걸러낸다.
// 재검증은 번호 구간이 아니라 "verifiedAt이 가장 오래된 N개"를 그때그때 집으므로
// CronJob의 (job, startNo) 선점을 쓸 수 없다(선점할 번호가 없다). 대신 직전 실행
// 시각으로 거른다. 잠금이 아니므로 밀리초 단위로 겹쳐 뜨면 뚫리지만, 그때 생기는
// 손해는 같은 묶음에 API를 두 번 쓰는 것뿐이고 데이터가 깨지지는 않는다.
const REFRESH_COOLDOWN_MS = 3 * 60 * 1000;

// ProductMaster 수집은 전체 검색 대상을 이 개수로 나눠 크론별로 한 조각씩 맡는다.
// vercel.json에 걸린 collect-product-master 크론 개수와 같아야 한다.
const PRODUCT_MASTER_BATCH_COUNT = 5;

// 몇 번째 조각을 맡을지는 "이 시간 창 안에서 이미 몇 번 돌았는지"로 센다.
// 크론 5개가 한 시간 안에 모여 있고 하루 1회씩이므로, 이 창 안의 기록은
// 오늘 것만 잡히고 어제 것은 섞이지 않는다.
const PRODUCT_MASTER_BATCH_WINDOW_MS = 6 * 60 * 60 * 1000;

// Vercel 함수 실행 한도(vercel.json의 maxDuration과 같은 값).
const FUNCTION_LIMIT_MS = 300_000;

// EP 생성·업로드 몫으로 남겨두는 시간.
const EP_RESERVE_MS = 90_000;

// 수집에 쓸 수 있는 시간. 한도에 걸려 강제 종료되면 EP 생성까지 가지 못하고
// 어디까지 수집했는지도 남지 않으므로, 그 전에 스스로 멈춘다.
const TIME_BUDGET_MS = FUNCTION_LIMIT_MS - EP_RESERVE_MS;

// 재검증 뒤 EP 생성·업로드에 남겨두는 시간.
// 실측상 EP 생성만 100초(8만여 건)라 수집 쪽 EP_RESERVE_MS(90초)로는 모자란다.
const REFRESH_EP_RESERVE_MS = 150_000;

// 재검증에 쓸 수 있는 시간. 다 쓰면 묶음 사이에서 멈추고 EP 단계로 넘어간다.
const REFRESH_TIME_BUDGET_MS = FUNCTION_LIMIT_MS - REFRESH_EP_RESERVE_MS;

/**
 * 이어서 수집할 시작 번호를 정한다.
 * - 기준은 products에 저장된 productNo 중 가장 큰 값
 * - 다만 저장 대상이 아닌 번호(판매 종료/출발 경과/없는 번호)만 나온 구간에서는
 *   productNo가 늘지 않는다. 실제로 수천 개씩 비어 있는 구간이 있어서, 그것만
 *   기준으로 삼으면 같은 구간을 영구히 다시 긁는다. 직전 실행이 어디까지
 *   훑었는지(lastNo)도 같이 보고 더 앞선 지점에서 이어받는다
 * - 양쪽 모두 비어 있으면 기준이 없으므로 null을 돌려준다
 */
async function resolveNextStartNo() {
  const [latestProduct, latestJob] = await Promise.all([
    Product.findOne({}).sort({ productNo: -1 }).select("productNo").lean(),
    CronJob.findOne({ job: CRON_JOB_TYPES.PRODUCT_COLLECT, lastNo: { $ne: null } })
      .sort({ created_at: -1 })
      .select("lastNo")
      .lean(),
  ]);

  const candidates = [];
  if (latestProduct?.productNo) candidates.push(Number(latestProduct.productNo));
  if (latestJob?.lastNo) candidates.push(Number(latestJob.lastNo));

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates) + 1;
}

/**
 * 구간을 선점하며 이번 실행 기록을 남긴다.
 * - (job, startNo) unique 제약으로 동시에 뜬 크론 중 하나만 통과한다
 * - 이미 선점된 구간이면 null을 돌려주고 이번 실행은 조용히 끝낸다
 * - 나중에 changeLog가 이 _id로 "어느 실행의 결과인지"를 가리킨다
 */
async function claimCollectJob(startNo, lastNo) {
  try {
    return await CronJob.create({
      job: CRON_JOB_TYPES.PRODUCT_COLLECT,
      startNo,
      lastNo,
    });
  } catch (err) {
    if (err.code === 11000) {
      return null;
    }
    throw err;
  }
}

/**
 * Product 기준 EP 파일을 만들어 FTP에 올린다.
 * - 대상이 0건이면 올리지 않는다. 운영 EP를 빈 파일로 덮으면 네이버 쪽에서
 *   전 상품 품절로 읽히므로, 수집이 비정상인 날에는 이전 파일을 유지한다
 */
async function publishProductEpFile(logger = console) {
  const { main, excluded } = await generateProductEpFile({ futureOnly: true });

  if (main.count === 0) {
    logger.warn?.("EP 대상 상품이 0건이라 업로드를 건너뜁니다.");
    return { count: 0, url: "", excludedCount: 0, excludedUrl: "", skippedReason: "no_ep_candidates" };
  }

  const url = await uploadEpFileToFtp(main.content, EP_FILENAME);
  const excludedUrl = await uploadEpFileToFtp(excluded.content, EP_FILENAME_EXCLUDED);

  return {
    count: main.count,
    url,
    excludedCount: excluded.count,
    excludedUrl,
    skippedReason: "",
  };
}

/**
 * 크론 1회 분량의 "Product 수집" 작업을 수행한다(상품 수집 + EP 생성).
 * - 수집 범위: DB의 최대 productNo 다음 번호부터 batchSize개
 * - 수집이 중단되거나 실패해도 EP 생성·업로드는 항상 시도한다
 */
async function runProductCollectJob(logger = console, options = {}) {
  const {
    batchSize = BATCH_SIZE,
    timeBudgetMs = TIME_BUDGET_MS,
  } = options;

  const startNo = await resolveNextStartNo();

  if (!startNo) {
    logger.error?.(
      "이어받을 기준이 없습니다. products가 비어 있으면 scripts/products-range.js로 첫 구간을 먼저 수집하세요.",
    );
    return { skipped: true, reason: "no_start_no" };
  }

  const endNo = startNo + batchSize - 1;
  const productNos = Array.from({ length: batchSize }, (_, i) => startNo + i);

  const run = await claimCollectJob(startNo, endNo);
  if (!run) {
    logger.warn?.({ startNo }, "이미 선점된 구간이라 이번 실행을 건너뜁니다.");
    return { skipped: true, reason: "already_claimed", startNo, endNo };
  }

  logger.info?.(
    { cronJobId: String(run._id), startNo, endNo, batchSize, timeBudgetMs },
    "상품 수집 시작",
  );

  // 함수 실행시간 제한(Vercel Hobby 300초) 안에서 EP 생성·업로드 시간을 남겨둔다.
  const deadline = Date.now() + timeBudgetMs;
  let results = null;
  let scrapeError = null;

  try {
    results = await scrapeProducts(productNos, {
      delayMs: 100,
      shouldStop: () => Date.now() >= deadline,
      onProgress: ({ current, total, productNo, created, updated, failed }) => {
        logger.info?.(
          { current, total, productNo, created, updated, failed },
          "상품 수집 진행",
        );
      },
    });
  } catch (err) {
    // FTP 용량 부족 등으로 중단된 경우에도 여기까지의 집계는 남아 있다.
    scrapeError = err;
    results = err.results || null;
    logger.error?.({ err: err.message }, "상품 수집이 중단되었습니다.");
  }

  // 요구사항: 수집 후에는 결과와 무관하게 항상 EP 파일을 생성한다.
  let ep = { count: 0, url: "", excludedCount: 0, excludedUrl: "", skippedReason: "" };
  let epError = null;

  try {
    ep = await publishProductEpFile(logger);
  } catch (err) {
    epError = err;
    ep = { count: 0, url: "", excludedCount: 0, excludedUrl: "", skippedReason: `error: ${err.message}` };
    logger.error?.({ err: err.message }, "EP 생성/업로드 실패");
  }

  const processedCount = results?.processed ?? 0;
  // 중간에 멈췄으면(시간 예산/FTP 이상) 실제로 끝낸 지점까지만 남긴다.
  // 그래야 다음 실행이 멈춘 자리에서 이어받는다.
  const truncated = Boolean(results?.stoppedEarly) || Boolean(scrapeError);

  if (truncated && processedCount > 0) {
    run.lastNo = startNo + processedCount - 1;
    await run.save();
  }

  const summary = {
    skipped: false,
    job: CRON_JOB_TYPES.PRODUCT_COLLECT,
    cronJobId: String(run._id),
    startNo,
    lastNo: run.lastNo,
    requestedCount: batchSize,
    processedCount,
    stoppedEarly: Boolean(results?.stoppedEarly),
    results: results || null,
    ep,
    error: [scrapeError?.message, epError?.message].filter(Boolean).join(" | ") || undefined,
  };

  logger.info?.(summary, "수집 작업 완료");

  return summary;
}

/**
 * 크론 1회 분량의 "Product 재검증" 작업을 수행한다.
 * - verifiedAt이 오래된 순으로 limit개를 상세 API로 다시 조회한다
 * - 구간을 정하지 않으므로 크론이 몇 번 돌든 자연히 이어지고, 한 바퀴를 돌면
 *   가장 오래 안 본 것이 다시 앞으로 온다. 순서가 흔들려도 결과는 같으므로
 *   Hobby 크론의 ±59분 오차나 실행 순서 뒤바뀜에 영향을 받지 않는다
 * - 수집 작업과 똑같이, 끝나면 EP 파일을 만들어 올린다
 */
async function runProductRefreshJob(logger = console, options = {}) {
  const {
    limit = REFRESH_BATCH_SIZE,
    concurrency = REFRESH_CONCURRENCY,
    timeBudgetMs = REFRESH_TIME_BUDGET_MS,
    cooldownMs = REFRESH_COOLDOWN_MS,
  } = options;

  const recent = await CronJob.findOne({
    job: CRON_JOB_TYPES.PRODUCT_CHANGE_TRACK,
    created_at: { $gte: new Date(Date.now() - cooldownMs) },
  })
    .sort({ created_at: -1 })
    .lean();

  if (recent) {
    logger.warn?.(
      { lastRunAt: recent.created_at, cooldownMs },
      "직전 재검증 실행과 너무 가까워 이번 실행을 건너뜁니다.",
    );
    return { skipped: true, reason: "cooldown", lastRunAt: recent.created_at };
  }

  const run = await CronJob.create({ job: CRON_JOB_TYPES.PRODUCT_CHANGE_TRACK });
  const deadline = Date.now() + timeBudgetMs;

  logger.info?.(
    { cronJobId: String(run._id), limit, concurrency, timeBudgetMs },
    "Product 재검증 시작",
  );

  const { total, processed, stoppedEarly, results } = await refreshOldestProducts({
    limit,
    concurrency,
    shouldStop: () => Date.now() >= deadline,
    // 1000건을 전부 남기면 로그가 신호를 잃는다. 바뀐 것과 실패한 것만 남긴다.
    onItem: ({ current, doc, status, changes, note, error }) => {
      if (status === "unchanged") return;

      logger.info?.(
        {
          current,
          productNo: doc.productNo,
          status,
          changes: changes || undefined,
          note: note || undefined,
          error: error?.message,
        },
        "재검증 변동",
      );
    },
  });

  // 수집 작업과 같다. 재검증이 중간에 멈췄어도 EP 생성·업로드는 항상 시도하고,
  // EP가 실패해도 재검증 결과(verifiedAt 갱신)는 이미 DB에 남아 있다.
  let ep = { count: 0, url: "", excludedCount: 0, excludedUrl: "", skippedReason: "" };
  let epError = null;

  try {
    ep = await publishProductEpFile(logger);
  } catch (err) {
    epError = err;
    ep = { count: 0, url: "", excludedCount: 0, excludedUrl: "", skippedReason: `error: ${err.message}` };
    logger.error?.({ err: err.message }, "EP 생성/업로드 실패");
  }

  const summary = {
    skipped: false,
    job: CRON_JOB_TYPES.PRODUCT_CHANGE_TRACK,
    cronJobId: String(run._id),
    requestedCount: limit,
    targetCount: total,
    processedCount: processed,
    stoppedEarly,
    results,
    ep,
    error: epError?.message || undefined,
  };

  logger.info?.(summary, "Product 재검증 완료");

  return summary;
}

/**
 * ProductMaster 수집 창(window)을 만든다.
 * - 오늘부터 1년 뒤까지의 출발일 구간을 본다
 */
function getProductMasterWindow() {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  return {
    startDate: today.toISOString().split("T")[0],
    endDate: nextYear.toISOString().split("T")[0],
  };
}

/**
 * 전체 검색 대상 중 이 배치가 맡을 구간만 잘라낸다.
 */
function sliceSearchTargetsForBatch(searchTargets, batchIndex) {
  const normalizedIndex = Math.max(
    0,
    Math.min(batchIndex, PRODUCT_MASTER_BATCH_COUNT - 1),
  );
  const sliceSize = Math.ceil(searchTargets.length / PRODUCT_MASTER_BATCH_COUNT);
  const start = normalizedIndex * sliceSize;

  return {
    allTargets: searchTargets.length,
    sliceSize,
    targets: searchTargets.slice(start, start + sliceSize),
  };
}

/**
 * 이번 실행이 맡을 조각 번호를 정한다.
 * - 배치 번호를 경로로 받지 않고, 최근 시간 창에서 몇 번째 실행인지로 센다
 * - 조각끼리는 대등하므로 어떤 실행이 몇 번을 맡든 결과는 같다
 */
async function resolveProductMasterBatchIndex() {
  const since = new Date(Date.now() - PRODUCT_MASTER_BATCH_WINDOW_MS);
  const ranInWindow = await CronJob.countDocuments({
    job: CRON_JOB_TYPES.PRODUCT_MASTER_COLLECT,
    created_at: { $gte: since },
  });

  return ranInWindow % PRODUCT_MASTER_BATCH_COUNT;
}

/**
 * 크론 1회 분량의 "ProductMaster 수집" 작업을 수행한다.
 * - 검색 대상을 PRODUCT_MASTER_BATCH_COUNT개로 나눈 중 한 조각만 맡는다
 * - EP 파일은 만들지 않는다. EP는 Product 수집 작업이 전담한다
 * @param {object} [options.batchIndex] 조각 번호를 직접 지정(수동 실행용)
 */
async function runProductMasterCollectJob(logger = console, options = {}) {
  const batchIndex = Number.isInteger(options.batchIndex)
    ? options.batchIndex
    : await resolveProductMasterBatchIndex();

  const { startDate, endDate } = getProductMasterWindow();
  const searchTargets = await getProductMasterSearchTargets();
  const { targets, allTargets, sliceSize } = sliceSearchTargetsForBatch(
    searchTargets,
    batchIndex,
  );

  const run = await CronJob.create({ job: CRON_JOB_TYPES.PRODUCT_MASTER_COLLECT });

  logger.info?.(
    {
      cronJobId: String(run._id),
      batchIndex,
      batchCount: PRODUCT_MASTER_BATCH_COUNT,
      targets: targets.length,
      allTargets,
      sliceSize,
      startDate,
      endDate,
    },
    "ProductMaster 수집 시작",
  );

  const results = await scrapeAllProductMasters(targets, startDate, endDate, {
    delayMs: 100,
    onProgress: ({ current, total, target, created, updated, failed }) => {
      logger.info?.(
        {
          batchIndex,
          current,
          total,
          type: target?.type,
          target: target?.name || target?.areaNo || target?.themeNo,
          created,
          updated,
          failed,
        },
        "ProductMaster 수집 진행",
      );
    },
  });

  const summary = {
    skipped: false,
    job: CRON_JOB_TYPES.PRODUCT_MASTER_COLLECT,
    cronJobId: String(run._id),
    batchIndex,
    batchCount: PRODUCT_MASTER_BATCH_COUNT,
    targetCount: targets.length,
    results,
  };

  logger.info?.(summary, "ProductMaster 수집 완료");

  return summary;
}

module.exports = {
  resolveNextStartNo,
  publishProductEpFile,
  runProductCollectJob,
  runProductRefreshJob,
  resolveProductMasterBatchIndex,
  runProductMasterCollectJob,
};
