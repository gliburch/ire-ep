const { getEnv } = require("../config/env");
const DailyBatchState = require("../models/DailyBatchState");
const { getProductMasterSearchTargets } = require("./searchTargetService");
const { scrapeAllProductMasters } = require("./productMasterScraperService");
const { generateEpFile } = require("./epService");
const { uploadEpFileToFtp } = require("./ftpService");
const DAILY_BATCH_COUNT = Number(getEnv("DAILY_SCRAPE_BATCH_COUNT", "5"));
const DAILY_BATCH_TIMEZONE = getEnv("DAILY_BATCH_TIMEZONE", "Asia/Seoul");

let jobRunning = false;

function getDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_BATCH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function getDailyWindow() {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  return {
    startDate: today.toISOString().split("T")[0],
    endDate: nextYear.toISOString().split("T")[0],
  };
}

function getTimeZoneOffsetMs(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_BATCH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const zonedTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return zonedTime - date.getTime();
}

function getDateKeyStart(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return new Date(startGuess.getTime() - getTimeZoneOffsetMs(startGuess));
}

/**
 * 전체 searchTargets 중 현재 배치가 처리할 구간만 잘라낸다
 */
function sliceSearchTargetsForBatch(searchTargets, batchIndex) {
  const normalizedBatchIndex = Math.max(0, Math.min(batchIndex, DAILY_BATCH_COUNT - 1));
  const sliceSize = Math.ceil(searchTargets.length / DAILY_BATCH_COUNT);
  const start = normalizedBatchIndex * sliceSize;
  const end = start + sliceSize;

  return {
    allTargets: searchTargets.length,
    sliceSize,
    targets: searchTargets.slice(start, end),
  };
}

/**
 * 일자별 배치 완료 상태와 처리 통계를 누적 저장한다
 */
async function appendBatchState(dateKey, batchKey, scrapeResult) {
  const update = {
    $addToSet: {
      completedBatches: batchKey,
    },
    $inc: {
      "stats.created": scrapeResult.created || 0,
      "stats.updated": scrapeResult.updated || 0,
      "stats.failed": scrapeResult.failed || 0,
    },
  };

  return DailyBatchState.findOneAndUpdate(
    { dateKey },
    update,
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );
}

async function runDailyScrapeBatch(batchIndex, logger = console) {
  const dateKey = getDateKey();

  if (jobRunning) {
    logger.warn?.("Daily scrape batch is already running. Skipping overlapping trigger.");
    return { skipped: true, reason: "already_running" };
  }

  jobRunning = true;

  try {
    const { startDate, endDate } = getDailyWindow();
    const searchTargets = await getProductMasterSearchTargets();
    const { targets, allTargets, sliceSize } = sliceSearchTargetsForBatch(searchTargets, batchIndex);
    const batchKey = `${dateKey}:batch-${batchIndex + 1}-of-${DAILY_BATCH_COUNT}`;

    logger.info?.({
      batchIndex,
      batchCount: DAILY_BATCH_COUNT,
      batchKey,
      targets: targets.length,
      allTargets,
      sliceSize,
      startDate,
      endDate,
    }, "Starting daily scrape batch");

    const scrapeResult = await scrapeAllProductMasters(targets, startDate, endDate, {
      delayMs: 100,
      onProgress: ({ current, total, target, created, updated, failed }) => {
        logger.info?.({
          batchIndex,
          batchCount: DAILY_BATCH_COUNT,
          current,
          total,
          type: target?.type,
          target: target?.name || target?.areaNo || target?.themeNo,
          created,
          updated,
          failed,
        }, "Daily scrape batch progress");
      },
    });

    const state = await appendBatchState(dateKey, batchKey, scrapeResult);

    return {
      skipped: false,
      batchIndex,
      batchCount: DAILY_BATCH_COUNT,
      batchKey,
      targetCount: targets.length,
      scrapeResult,
      dateKey,
      completedBatches: state.completedBatches.length,
    };
  } finally {
    jobRunning = false;
  }
}

async function runDailyFinalizeJob(logger = console) {
  const dateKey = getDateKey();

  if (jobRunning) {
    logger.warn?.("Daily finalize job is already running. Skipping overlapping trigger.");
    return { skipped: true, reason: "already_running" };
  }

  jobRunning = true;

  try {
    const state = await DailyBatchState.findOne({ dateKey });

    if (!state) {
      return {
        skipped: true,
        reason: "no_batch_state",
        dateKey,
      };
    }

    if (state.completedBatches.length < DAILY_BATCH_COUNT) {
      return {
        skipped: true,
        reason: "incomplete_batches",
        dateKey,
        completedBatches: state.completedBatches.length,
        expectedBatches: DAILY_BATCH_COUNT,
      };
    }

    const updatedFrom = getDateKeyStart(dateKey);
    const epResult = await generateEpFile({
      updatedFrom,
    });

    if (epResult.count === 0) {
      return {
        skipped: true,
        reason: "no_recent_product_masters",
        dateKey,
        completedBatches: state.completedBatches.length,
      };
    }

    const normalizedContent = epResult.content.replace(/^\uFEFF/, "");
    const url = await uploadEpFileToFtp(normalizedContent, "ire_naver_ep.txt");

    state.finalizedAt = new Date();
    await state.save();

    logger.info?.({
      dateKey,
      completedBatches: state.completedBatches.length,
      epCount: epResult.count,
      updatedFrom,
      url,
    }, "Daily finalize job completed");

    return {
      skipped: false,
      dateKey,
      completedBatches: state.completedBatches,
      epCount: epResult.count,
      updatedFrom,
      url,
    };
  } finally {
    jobRunning = false;
  }
}

module.exports = {
  runDailyScrapeBatch,
  runDailyFinalizeJob,
};
