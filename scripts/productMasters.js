const { PRODUCT_MASTER_SCRAPE_MONTHS } = require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const scraperService = require("../services/scraperService");

async function main() {
  await connectDB();

  const today = new Date();
  const endDateObj = new Date(today);
  endDateObj.setMonth(endDateObj.getMonth() + Number(PRODUCT_MASTER_SCRAPE_MONTHS));

  const startDate = today.toISOString().split("T")[0];
  const endDate = endDateObj.toISOString().split("T")[0];

  console.log(`Starting ProductMaster scrape from ${startDate} to ${endDate}`);
  const targets = await scraperService.getProductMasterSearchTargets();
  console.log(`Found ${targets.areaTargets.length} area targets and ${targets.themeTargets.length} theme targets`);

  const results = await scraperService.scrapeProductMasters(
    targets,
    startDate,
    endDate,
    {
      onProgress: ({ current, total, target, created, updated }) => {
        const label = target?.name || String(target?.areaNo || target?.themeNo || "Unknown");
        console.log(
          `\n\x1b[35m[${current}/${total}]\x1b[0m \x1b[36m${target?.type.toUpperCase()}\x1b[0m ${label} | \x1b[32mcreated: ${created}\x1b[0m, \x1b[33mupdated: ${updated}\x1b[0m`,
        );
      },
      onItem: ({ master, status, error }) => {
        const title = master?.masterProductName || master?.masterCode || "Unknown";
        if (status === "created") {
          console.log(`  \x1b[32m[NEW]\x1b[0m ${title}`);
        } else if (status === "updated") {
          console.log(`  \x1b[33m[UPDATE]\x1b[0m ${title}`);
        } else {
          console.log(`  \x1b[31m[ERROR]\x1b[0m ${title} - ${error?.message || "Unknown error"}`);
        }
      },
    },
  );

  console.log("\nScrape Summary:");
  console.log(
    JSON.stringify(
      {
        success: true,
        period: { startDate, endDate },
        targets: {
          areaCount: targets.areaTargets.length,
          themeCount: targets.themeTargets.length,
        },
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
