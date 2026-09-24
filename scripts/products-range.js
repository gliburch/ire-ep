require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { scrapeProducts } = require("../services/productScraperService");

// 중단 시 재시작 안내를 만들려면 catch에서도 범위 끝 번호를 알아야 한다.
let rangeEnd = null;

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
  rangeEnd = endNo;
  const productNos = Array.from({ length: count }, (_, i) => startNo + i);

  await connectDB();

  console.log(
    `\x1b[36m[scrape-range]\x1b[0m productNo ${startNo} ~ ${endNo} (총 ${count}개) 시작\n`,
  );

  const results = await scrapeProducts(productNos, {
    onItem: ({ current, productNo, status, product, error, soldoutFlags, departureDate }) => {
      const prefix = `\x1b[35m[${current}/${count}]\x1b[0m`;
      const title = product?.epData?.title || "";
      if (status === "created") {
        console.log(`${prefix} \x1b[32m[NEW]\x1b[0m ${productNo} | ${title}`);
      } else if (status === "updated") {
        console.log(`${prefix} \x1b[33m[UPDATED]\x1b[0m ${productNo} | ${title}`);
      } else if (status === "soldout") {
        console.log(`${prefix} \x1b[34m[SOLDOUT]\x1b[0m ${productNo} | ${(soldoutFlags || []).join(", ")}`);
      } else if (status === "departed") {
        console.log(`${prefix} \x1b[36m[DEPARTED]\x1b[0m ${productNo} | ${departureDate} 출발`);
      } else if (status === "skipped") {
        console.log(`${prefix} \x1b[90m[SKIP]\x1b[0m ${productNo} | ${error?.message || "Unknown reason"}`);
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
    console.error(`\n\x1b[31m[ABORTED]\x1b[0m ${error.message}`);

    // 중단된 경우 집계와 재시작 지점을 남겨 이어서 돌릴 수 있게 한다.
    if (error.aborted) {
      const resumeNo = error.lastProductNo;
      const remaining = rangeEnd ? rangeEnd - resumeNo + 1 : null;

      console.error("\nScrape Summary (중단):");
      console.error(
        JSON.stringify(
          {
            stoppedAt: { productNo: resumeNo, index: error.lastIndex },
            results: error.results,
          },
          null,
          2,
        ),
      );

      if (remaining) {
        console.error(
          `\n이어서 실행: npm run ${process.env.NODE_ENV === "production" ? "scrape:products-range:prd" : "scrape:products-range:dev"} -- ${resumeNo} ${remaining}`,
        );
      }
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
