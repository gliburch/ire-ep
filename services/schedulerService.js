const fs = require("fs");
const path = require("path");
const { getProductMasterSearchTargets, scrapeAllProductMasters } = require("./scraperService");
const { generateEpFileFromMasterCodes } = require("./epService");
const { uploadEpFile } = require("./ftpService");

const DAILY_EP_FILENAME = "ire_naver_ep.txt";

let jobRunning = false;

async function runDailyScrapeJob(logger = console) {
  if (jobRunning) {
    logger.warn?.("Daily scrape job is already running. Skipping overlapping trigger.");
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

    logger.info?.({
      startDate,
      endDate,
      areaCount: targets.areaTargets.length,
      themeCount: targets.themeTargets.length,
    }, "Starting daily ProductMaster scrape job");

    const scrapeResult = await scrapeAllProductMasters(targets, startDate, endDate, {
      delayMs: 100,
      collectMasterCodes: true,
      onProgress: ({ current, total, target, created, updated, failed }) => {
        logger.info?.({
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

    logger.info?.({
      scrapeResult: {
        created: scrapeResult.created,
        updated: scrapeResult.updated,
        failed: scrapeResult.failed,
        masterCodeCount: scrapeResult.masterCodes.length,
      },
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

module.exports = {
  runDailyScrapeJob,
};
