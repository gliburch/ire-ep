const { PRODUCT_MASTER_SCRAPE_MONTHS } = require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { getProductMasterSearchTargets } = require("../services/searchTargetService");
const { scrapeAllProductMasters } = require("../services/productMasterScraperService");

const SCRAPE_MONTHS = Number(PRODUCT_MASTER_SCRAPE_MONTHS);

async function main() {
  await connectDB();

  const today = new Date();
  const endDateObj = new Date(today);
  endDateObj.setMonth(endDateObj.getMonth() + SCRAPE_MONTHS);

  const startDate = today.toISOString().split("T")[0];
  const endDate = endDateObj.toISOString().split("T")[0];

  console.log(`\x1b[36m[scrape]\x1b[0m ProductMaster 스크래핑: ${startDate} ~ ${endDate}`);

  const searchTargets = await getProductMasterSearchTargets();
  const areaCount = searchTargets.filter((t) => t.type === "area").length;
  const themeCount = searchTargets.filter((t) => t.type === "theme").length;
  console.log(`\x1b[36m[scrape]\x1b[0m 대상: 지역 ${areaCount}개 / 테마 ${themeCount}개`);

  const results = await scrapeAllProductMasters(searchTargets, startDate, endDate, {
    onProgress: ({ current, total, target, created, updated, failed }) => {
      const label = target?.name || String(target?.areaNo || target?.themeNo || "Unknown");
      console.log(
        `\n\x1b[35m[${current}/${total}]\x1b[0m \x1b[36m${(target?.type || "").toUpperCase()}\x1b[0m ${label} | \x1b[32mcreated: ${created}\x1b[0m, \x1b[33mupdated: ${updated}\x1b[0m, \x1b[31mfailed: ${failed}\x1b[0m`,
      );
    },
    onItem: ({ productMaster, status, error }) => {
      const title = productMaster?.masterProductName || productMaster?.masterCode || "Unknown";
      if (status === "created") {
        console.log(`  \x1b[32m[NEW]\x1b[0m ${title}`);
      } else if (status === "updated") {
        console.log(`  \x1b[33m[UPDATE]\x1b[0m ${title}`);
      } else {
        console.log(`  \x1b[31m[ERROR]\x1b[0m ${title} - ${error?.message || "Unknown error"}`);
      }
    },
  });

  console.log("\nScrape Summary:");
  console.log(
    JSON.stringify(
      {
        success: true,
        period: { startDate, endDate },
        targets: { areaCount, themeCount, total: searchTargets.length },
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Scrape failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
