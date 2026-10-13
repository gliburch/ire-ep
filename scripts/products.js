require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { scrapeProduct, scrapeProducts } = require("../services/productScraperService");

const npmScript = process.env.NODE_ENV === "production" ? "scrape:products:prd" : "scrape:products:dev";

// 중단 시 재시작 안내를 만들려면 catch에서도 범위 끝 번호를 알아야 한다.
let rangeEnd = null;

async function scrapeSingle(productNo) {
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
        { success: false, status, productNo, ...(soldoutFlags ? { soldoutFlags } : {}), ...(departureDate ? { departureDate } : {}) },
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

async function scrapeRange(startNo, count) {
  const endNo = startNo + count - 1;
  rangeEnd = endNo;
  const productNos = Array.from({ length: count }, (_, i) => startNo + i);

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

async function main() {
  const productNo = parseInt(process.argv[2], 10);
  const count = process.argv[3] === undefined ? null : parseInt(process.argv[3], 10);

  if (!productNo || (count !== null && !(count > 0))) {
    console.error("\x1b[31m[ERROR]\x1b[0m productNo가 필요합니다. count는 1 이상이어야 합니다.");
    console.error(`  사용법: npm run ${npmScript} -- <productNo> [count]`);
    console.error(`  단일:   npm run ${npmScript} -- 106020300`);
    console.error(`  범위:   npm run ${npmScript} -- 106020300 1000`);
    process.exitCode = 1;
    return;
  }

  await connectDB();

  if (count === null) {
    await scrapeSingle(productNo);
  } else {
    await scrapeRange(productNo, count);
  }
}

main()
  .catch((error) => {
    console.error(`\n\x1b[31m[ERROR]\x1b[0m ${error.message}`);

    // 범위 수집이 중단된 경우 집계와 재시작 지점을 남겨 이어서 돌릴 수 있게 한다.
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
        console.error(`\n이어서 실행: npm run ${npmScript} -- ${resumeNo} ${remaining}`);
      }
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
