require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");

// 모든 모델을 등록해 컬렉션과 인덱스 정의를 로드한다.
const Product = require("../models/Product");
const ProductMaster = require("../models/ProductMaster");
const DailyBatchState = require("../models/DailyBatchState");

const MODELS = [Product, ProductMaster, DailyBatchState];

// MongoDB는 스키마리스라 첫 저장 시 컬렉션이 자동 생성되지만,
// 이 스크립트는 컬렉션을 미리 만들고 스키마에 정의된 인덱스(unique 등)를
// DB에 동기화한다. 멱등하므로 최초 설치와 인덱스 변경 반영 모두에 쓸 수 있다.
async function main() {
  const conn = await connectDB();
  console.log(
    `\x1b[36m[setup-db]\x1b[0m 연결됨: ${conn.host}/${conn.name}`,
  );

  for (const Model of MODELS) {
    await Model.createCollection();
    // 스키마에 정의된 인덱스를 DB에 반영한다(없으면 생성, 불필요하면 제거).
    await Model.syncIndexes();
    const indexes = await Model.collection.indexes();
    console.log(
      `\x1b[32m[setup-db]\x1b[0m ${Model.collection.name} 준비 완료 (인덱스 ${indexes.length}개: ${indexes.map((i) => Object.keys(i.key).join("+")).join(", ")})`,
    );
  }

  const collections = await conn.db.listCollections().toArray();
  console.log(
    `\x1b[36m[setup-db]\x1b[0m 컬렉션 목록: ${collections.map((c) => c.name).sort().join(", ")}`,
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
