const fs = require("fs");
const path = require("path");
const { getEnv } = require("../config/env");
const { getProductMasterSearchTargets, scrapeAllProductMasters } = require("./scraperService");
const { generateEpFileFromMasterCodes } = require("./epService");
const { uploadEpFile } = require("./ftpService");

const DAILY_SCRAPE_ENABLED = getEnv("DAILY_SCRAPE_ENABLED", "true") !== "false";
const DAILY_SCRAPE_HOUR = Number(getEnv("DAILY_SCRAPE_HOUR", "23"));
const DAILY_SCRAPE_MINUTE = Number(getEnv("DAILY_SCRAPE_MINUTE", "0"));
const DAILY_SCRAPE_TIMEZONE = getEnv("DAILY_SCRAPE_TIMEZONE", "Asia/Seoul");
const DAILY_EP_FILENAME = "ire_naver_ep.txt";

let schedulerTimer = null;
let jobRunning = false;
let lastTriggeredDateKey = "";

function getNowParts(timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

async function runDailyScrapeJob(logger = console) {
  if (jobRunning) {
    logger.warn("Daily scrape job is already running. Skipping overlapping trigger.");
    return { skipped: true, reason: "already_running" };
  }

  jobRunning = true;

  try {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const startDate = today.toISOString().split("T")[0];
    const endDate = nextYear.toISOString().split("T")[0];
    const targets = await getProductMasterSearchTargets();

    logger.info({
      startDate,
      endDate,
      areaCount: targets.areaTargets.length,
      themeCount: targets.themeTargets.length,
    }, "Starting daily ProductMaster scrape job");

    const scrapeResult = await scrapeAllProductMasters(targets, startDate, endDate, {
      delayMs: 100,
      collectMasterCodes: true,
      onProgress: ({ current, total, target, created, updated, failed }) => {
        logger.info({
          current,
          total,
          type: target?.type,
          target: target?.name || target?.areaNo || target?.themeNo,
          created,
          updated,
          failed,
        }, "Daily scrape progress");
      },
    });

    const epResult = await generateEpFileFromMasterCodes(scrapeResult.masterCodes);
    const normalizedContent = epResult.content.replace(/^\uFEFF/, "");
    const localFilePath = path.join(process.cwd(), DAILY_EP_FILENAME);

    fs.writeFileSync(localFilePath, normalizedContent, "utf8");
    const url = await uploadEpFile(normalizedContent, DAILY_EP_FILENAME);

    logger.info({
      scrapeResult,
      epCount: epResult.count,
      url,
      file: localFilePath,
    }, "Daily scrape job completed");

    return {
      skipped: false,
      scrapeResult,
      epCount: epResult.count,
      url,
      file: localFilePath,
    };
  } finally {
    jobRunning = false;
  }
}

function startDailyScheduler(logger = console) {
  if (!DAILY_SCRAPE_ENABLED) {
    logger.info("Daily scrape scheduler is disabled.");
    return;
  }

  if (schedulerTimer) {
    return;
  }

  logger.info({
    hour: DAILY_SCRAPE_HOUR,
    minute: DAILY_SCRAPE_MINUTE,
    timeZone: DAILY_SCRAPE_TIMEZONE,
  }, "Daily scrape scheduler started");

  schedulerTimer = setInterval(async () => {
    const now = getNowParts(DAILY_SCRAPE_TIMEZONE);

    if (now.hour !== DAILY_SCRAPE_HOUR || now.minute !== DAILY_SCRAPE_MINUTE) {
      return;
    }

    if (lastTriggeredDateKey === now.dateKey) {
      return;
    }

    lastTriggeredDateKey = now.dateKey;

    try {
      await runDailyScrapeJob(logger);
    } catch (err) {
      logger.error({ err }, "Daily scrape job failed");
    }
  }, 30 * 1000);
}

module.exports = {
  runDailyScrapeJob,
  startDailyScheduler,
};
