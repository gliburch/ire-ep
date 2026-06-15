require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { scrapeProduct } = require("../services/productScraperService");

async function main() {
  const productNo = process.argv[2];

  if (!productNo) {
    console.error("\x1b[31m[ERROR]\x1b[0m productNo가 필요합니다.");
    console.error("  사용법: npm run product:scrape -- <productNo>");
    console.error("  예시:   npm run product:scrape -- 123");
    process.exitCode = 1;
    return;
  }

  await connectDB();

  console.log(`\x1b[36m[scrape]\x1b[0m productNo=${productNo} 스크래핑 시작`);

  const { product, status } = await scrapeProduct(productNo);
  const title = product?.epData?.title || "Unknown";

  if (status === "created") {
    console.log(`  \x1b[32m[NEW]\x1b[0m ${title}`);
  } else {
    console.log(`  \x1b[33m[UPDATED]\x1b[0m ${title}`);
  }

  console.log("\nScrape Summary:");
  console.log(
    JSON.stringify(
      {
        success: true,
        status,
        productNo: product.productNo,
        title,
        departureDate: product.departureDate,
        arrivalDate: product.arrivalDate,
        epDataId: product.epData?.id,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(`  \x1b[31m[ERROR]\x1b[0m ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
