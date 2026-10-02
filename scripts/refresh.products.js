require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Product = require("../models/Product");
const { refreshOldestProducts } = require("../services/productRefreshService");

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (hit) return parseInt(hit.slice(prefix.length), 10);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) {
    return parseInt(process.argv[index + 1], 10);
  }

  return fallback;
}

async function main() {
  const limit = parseArg("limit", 100);
  const concurrency = parseArg("concurrency", 10);

  await connectDB();

  console.log(
    `\x1b[36m[refresh]\x1b[0m verifiedAt 오래된 순 ${limit}개 재검증 시작 (동시 ${concurrency})\n`,
  );

  const startedAt = Date.now();

  const remaining = await Product.countDocuments({
    epData: { $exists: true, $ne: null },
  });

  const { total, results } = await refreshOldestProducts({
    limit,
    concurrency,
    onItem: ({ current, total, doc, status, changes, note, error }) => {
      const prefix = `\x1b[35m[${current}/${total}]\x1b[0m`;

      if (status === "changed") {
        const summary = Object.entries(changes)
          .map(([field, { from, to }]) => `${field}: ${from} → ${to}`)
          .join(", ");
        console.log(`${prefix} \x1b[33m[CHANGED]\x1b[0m ${doc.productNo} | ${summary}`);
      } else if (status === "deleted") {
        console.log(`${prefix} \x1b[34m[DELETED]\x1b[0m ${doc.productNo} | ${note}`);
      } else if (status === "failed") {
        console.log(`${prefix} \x1b[31m[ERROR]\x1b[0m ${doc.productNo} | ${error?.message || "Unknown error"}`);
      } else {
        console.log(`${prefix} \x1b[90m[OK]\x1b[0m ${doc.productNo}`);
      }
    },
  });

  const elapsedMs = Date.now() - startedAt;
  const perItemMs = total > 0 ? elapsedMs / total : 0;

  console.log("\nRefresh Summary:");
  console.log(
    JSON.stringify(
      {
        total,
        concurrency,
        results,
        elapsed: `${(elapsedMs / 1000).toFixed(1)}s`,
        perItem: `${perItemMs.toFixed(0)}ms`,
        throughputPerSec: Number((total / (elapsedMs / 1000)).toFixed(2)),
        // 실측 처리율로 환산한, 저장된 상품 전체를 한 바퀴 도는 데 걸릴 시간
        targetTotal: remaining,
        projectedAll: `${((remaining * perItemMs) / 1000 / 60).toFixed(0)}분`,
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
