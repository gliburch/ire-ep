const { getEnv } = require("../config/env");
const DailyBatchState = require("../models/DailyBatchState");
const { getProductMasterSearchTargets, scrapeAllProductMasters } = require("./productMasterScraperService");
const { generateEpFile } = require("./epService");
const { uploadEpFileToFtp } = require("./ftpService");
const DAILY_BATCH_COUNT = Number(getEnv("DAILY_SCRAPE_BATCH_COUNT", "5"));
const DAILY_BATCH_TIMEZONE = getEnv("DAILY_BATCH_TIMEZONE", "Asia/Seoul");

let jobRunning = false;

function getDateKey(timeZone = DAILY_BATCH_TIMEZONE, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function getDailyWindow(date = new Date()) {
  const today = new Date(date);
  const nextYear = new Date(today);
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  return {
    startDate: today.toISOString().split("T")[0],
    endDate: nextYear.toISOString().split("T")[0],
  };
}

function getTimeZoneOffsetMs(date, timeZone = DAILY_BATCH_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
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

function getDateKeyRange(dateKey, timeZone = DAILY_BATCH_TIMEZONE) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const endGuess = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

  return {
    start: new Date(startGuess.getTime() - getTimeZoneOffsetMs(startGuess, timeZone)),
    end: new Date(endGuess.getTime() - getTimeZoneOffsetMs(endGuess, timeZone)),
  };
}

function getTargetSlice(searchTargets, batchIndex, batchCount = DAILY_BATCH_COUNT) {
  const normalizedBatchCount = Math.max(1, batchCount);
  const normalizedBatchIndex = Math.max(0, Math.min(batchIndex, normalizedBatchCount - 1));
  const sliceSize = Math.ceil(searchTargets.length / normalizedBatchCount);
  const start = normalizedBatchIndex * sliceSize;
  const end = start + sliceSize;

  return {
    allTargets: searchTargets.length,
    sliceSize,
    targets: searchTargets.slice(start, end),
  };
}

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

async function runDailyScrapeBatch(batchIndex, options = {}) {
  const {
    logger = console,
    batchCount = DAILY_BATCH_COUNT,
    dateKey = getDateKey(),
  } = options;

  if (jobRunning) {
    logger.warn?.("Daily scrape batch is already running. Skipping overlapping trigger.");
    return { skipped: true, reason: "already_running" };
  }

  jobRunning = true;

  try {
    const { startDate, endDate } = getDailyWindow();
    const searchTargets = await getProductMasterSearchTargets();
    const { targets, allTargets, sliceSize } = getTargetSlice(searchTargets, batchIndex, batchCount);
    const batchKey = `${dateKey}:batch-${batchIndex + 1}-of-${batchCount}`;

    logger.info?.({
      batchIndex,
      batchCount,
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
          batchCount,
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
      batchCount,
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

async function runDailyFinalizeJob(options = {}) {
  const {
    logger = console,
    dateKey = getDateKey(),
  } = options;

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

    const { start, end } = getDateKeyRange(dateKey, DAILY_BATCH_TIMEZONE);
    const epResult = await generateEpFile({
      recentOnly: false,
      updatedFrom: start,
      updatedTo: end,
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
      updatedFrom: start,
      updatedTo: end,
      url,
    }, "Daily finalize job completed");

    return {
      skipped: false,
      dateKey,
      completedBatches: state.completedBatches,
      epCount: epResult.count,
      updatedFrom: start,
      updatedTo: end,
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
