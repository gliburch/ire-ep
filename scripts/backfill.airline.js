require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Product = require("../models/Product");
const { fetchProductFromApi } = require("../services/productScraperService");

/**
 * 기존 Product의 epData에 항공사·편명 필드를 채워 넣는다.
 * - 상세 API만 호출하고 FTP/이미지는 건드리지 않으므로 재검증보다도 가볍다
 * - changeLog에 남기지 않는다. 코드 변경에 따른 1회성 백필이지 상품 변경이 아니다
 */

const AIRLINE_FIELDS = {
  transport_name: "transportName",
  transport_code: "transportCode",
  departure_airline_name: "departureAirlineName",
  arrival_airline_name: "arrivalAirlineName",
  departure_flight: "departureFlight",
  arrival_flight: "arrivalFlight",
};

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

function pickAirlineUpdate(result) {
  const update = {};
  for (const [field, apiKey] of Object.entries(AIRLINE_FIELDS)) {
    const value = result?.[apiKey];
    if (value) update[`epData.${field}`] = value;
  }
  return update;
}

async function backfillOne(doc) {
  const apiResponse = await fetchProductFromApi(doc.productNo);
  const result = apiResponse.result || {};
  const update = pickAirlineUpdate(result);

  if (Object.keys(update).length === 0) {
    return { status: "empty" };
  }

  await Product.updateOne({ _id: doc._id }, { $set: update });
  return { status: "updated", fields: Object.keys(update).length };
}

async function main() {
  const limit = parseArg("limit", 0);
  const concurrency = parseArg("concurrency", 10);

  await connectDB();

  // 이미 transport_name이 들어간 문서는 건너뛴다. 한 번 돌린 뒤 재실행해도 안전.
  const query = { "epData.transport_name": { $exists: false } };
  const total = await Product.countDocuments(query);
  const findLimit = limit > 0 ? limit : total;

  console.log(
    `\x1b[36m[backfill-airline]\x1b[0m 대상 ${total}건 중 ${findLimit}건 백필 시작 (동시 ${concurrency})\n`,
  );

  const docs = await Product.find(query).select("productNo").limit(findLimit).lean();

  const results = { updated: 0, empty: 0, failed: 0 };
  const startedAt = Date.now();

  for (let i = 0; i < docs.length; i += concurrency) {
    const batch = docs.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((doc) => backfillOne(doc)));

    settled.forEach((outcome, index) => {
      const doc = batch[index];
      const current = i + index + 1;
      const prefix = `\x1b[35m[${current}/${docs.length}]\x1b[0m`;

      if (outcome.status === "fulfilled") {
        results[outcome.value.status]++;
        if (outcome.value.status === "updated") {
          console.log(`${prefix} \x1b[32m[OK]\x1b[0m ${doc.productNo} (${outcome.value.fields} fields)`);
        } else {
          console.log(`${prefix} \x1b[90m[EMPTY]\x1b[0m ${doc.productNo}`);
        }
      } else {
        results.failed++;
        console.log(
          `${prefix} \x1b[31m[ERROR]\x1b[0m ${doc.productNo} | ${outcome.reason?.message || "Unknown"}`,
        );
      }
    });
  }

  const elapsedMs = Date.now() - startedAt;
  const perItemMs = docs.length > 0 ? elapsedMs / docs.length : 0;

  console.log("\nBackfill Summary:");
  console.log(
    JSON.stringify(
      {
        processed: docs.length,
        concurrency,
        results,
        elapsed: `${(elapsedMs / 1000).toFixed(1)}s`,
        perItem: `${perItemMs.toFixed(0)}ms`,
        throughputPerSec: Number((docs.length / (elapsedMs / 1000)).toFixed(2)),
        remainingAfter: total - docs.length,
        projectedAll: `${((total * perItemMs) / 1000 / 60).toFixed(1)}분`,
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
