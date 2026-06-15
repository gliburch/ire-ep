require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { scrapeProducts } = require("../services/productScraperService");

async function main() {
  const startNo = parseInt(process.argv[2], 10);
  const count = parseInt(process.argv[3] || "1000", 10);

  if (!startNo || isNaN(startNo)) {
    console.error("\x1b[31m[ERROR]\x1b[0m startNo가 필요합니다.");
    console.error("  사용법: npm run product:scrape-range -- <startNo> [count]");
    console.error("  예시:   npm run product:scrape-range -- 106020300 1000");
    process.exitCode = 1;
    return;
  }

  const endNo = startNo + count - 1;
  const productNos = Array.from({ length: count }, (_, i) => startNo + i);

  await connectDB();

  console.log(
    `\x1b[36m[scrape-range]\x1b[0m productNo ${startNo} ~ ${endNo} (총 ${count}개) 시작\n`,
  );

  const results = await scrapeProducts(productNos, {
    onItem: ({ current, productNo, status, product, error }) => {
      const prefix = `\x1b[35m[${current}/${count}]\x1b[0m`;
      const title = product?.epData?.title || "";
      if (status === "created") {
        console.log(`${prefix} \x1b[32m[NEW]\x1b[0m ${productNo} | ${title}`);
      } else if (status === "updated") {
        console.log(`${prefix} \x1b[33m[UPDATED]\x1b[0m ${productNo} | ${title}`);
      } else if (status === "skipped") {
        console.log(`${prefix} \x1b[90m[SKIP]\x1b[0m ${productNo}`);
      } else {
        console.log(`${prefix} \x1b[31m[ERROR]\x1b[0m ${productNo} | ${error?.message || "Unknown error"}`);
      }
    },
  });

  console.log("\nScrape Summary:");
  console.log(
    JSON.stringify(
      {
        range: { startNo, endNo, count },
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
