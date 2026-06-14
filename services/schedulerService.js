const { DAILY_SCRAPE_BATCH_COUNT, DAILY_BATCH_TIMEZONE } = require("../config/env");
const BatchJob = require("../models/BatchJob");
const { getProductMasterSearchTargets, scrapeProductMasters } = require("./scraperService");
const { generateEpFileFromMasterCodes } = require("./epService");
const { uploadEpFile } = require("./ftpService");
const DAILY_BATCH_COUNT = Number(DAILY_SCRAPE_BATCH_COUNT);


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

function flattenTargets(targets) {
  return [
    ...(targets?.areaTargets || []),
    ...(targets?.themeTargets || []),
  ];
}

function getTargetSlice(targets, batchIndex, batchCount = DAILY_BATCH_COUNT) {
  const normalizedBatchCount = Math.max(1, batchCount);
  const normalizedBatchIndex = Math.max(0, Math.min(batchIndex, normalizedBatchCount - 1));
  const flatTargets = flattenTargets(targets);
  const sliceSize = Math.ceil(flatTargets.length / normalizedBatchCount);
  const start = normalizedBatchIndex * sliceSize;
  const end = start + sliceSize;

  return {
    allTargets: flatTargets.length,
    sliceSize,
    targets: flatTargets.slice(start, end),
  };
}

async function appendBatchState(dateKey, batchKey, scrapeResult) {
  const update = {
    $addToSet: {
      completedBatches: batchKey,
      masterCodes: { $each: scrapeResult.masterCodes || [] },
    },
    $inc: {
      "stats.created": scrapeResult.created || 0,
      "stats.updated": scrapeResult.updated || 0,
      "stats.failed": scrapeResult.failed || 0,
    },
  };

  return BatchJob.findOneAndUpdate(
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
    const targetGroups = await getProductMasterSearchTargets();
    const { targets, allTargets, sliceSize } = getTargetSlice(targetGroups, batchIndex, batchCount);
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

    const scrapeResult = await scrapeProductMasters(targets, startDate, endDate, {
      delayMs: 100,
      collectMasterCodes: true,
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
      accumulatedMasterCodes: state.masterCodes.length,
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
    const state = await BatchJob.findOne({ dateKey });

    if (!state || state.masterCodes.length === 0) {
      return {
        skipped: true,
        reason: "no_master_codes",
        dateKey,
      };
    }

    const epResult = await generateEpFileFromMasterCodes(state.masterCodes);
    const normalizedContent = epResult.content.replace(/^\uFEFF/, "");
    const url = await uploadEpFile(normalizedContent, "ire_naver_ep.txt");

    state.finalizedAt = new Date();
    await state.save();

    logger.info?.({
      dateKey,
      masterCodeCount: state.masterCodes.length,
      completedBatches: state.completedBatches.length,
      epCount: epResult.count,
      url,
    }, "Daily finalize job completed");

    return {
      skipped: false,
      dateKey,
      masterCodeCount: state.masterCodes.length,
      completedBatches: state.completedBatches,
      epCount: epResult.count,
      url,
    };
  } finally {
    jobRunning = false;
  }
}

module.exports = {
  DAILY_BATCH_COUNT,
  DAILY_BATCH_TIMEZONE,
  getDateKey,
  getTargetSlice,
  runDailyScrapeBatch,
  runDailyFinalizeJob,
};
