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

  const { product, status, soldoutFlags, departureDate } = await scrapeProduct(productNo);

  // 수집 대상이 아닌 상품은 저장하지 않으므로 사유만 알리고 끝낸다.
  if (status === "soldout" || status === "departed") {
    const reason = status === "soldout"
      ? `판매 종료/취소 상품이라 수집하지 않습니다 (${soldoutFlags.join(", ")})`
      : `출발일이 지난 상품이라 수집하지 않습니다 (${departureDate} 출발)`;

    console.log(`  \x1b[34m[${status.toUpperCase()}]\x1b[0m ${reason}`);
    console.log("\nScrape Summary:");
    console.log(
      JSON.stringify(
        { success: false, status, productNo: Number(productNo), ...(soldoutFlags ? { soldoutFlags } : {}), ...(departureDate ? { departureDate } : {}) },
        null,
        2,
      ),
    );
    return;
  }

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
