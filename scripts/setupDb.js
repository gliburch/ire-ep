require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");

// Mongoose는 모델이 등록되면 연결 시 해당 컬렉션과 인덱스를 자동 생성한다.
// 이 스크립트는 대상 컬렉션만 명시적으로 다뤄야 하므로 자동 생성을 끈다.
mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);

// 모든 모델을 등록해 컬렉션과 인덱스 정의를 로드한다.
const Product = require("../models/Product");
const ProductMaster = require("../models/ProductMaster");
const CronJob = require("../models/CronJob");
const Package = require("../models/Package");

const MODELS = [Product, ProductMaster, CronJob, Package];

// MongoDB는 스키마리스라 첫 저장 시 컬렉션이 자동 생성되지만,
// 이 스크립트는 컬렉션을 미리 만들고 스키마에 정의된 인덱스(unique 등)를
// DB에 동기화한다. 멱등하므로 최초 설치와 인덱스 변경 반영 모두에 쓸 수 있다.
//
// 컬렉션명을 인자로 주면 해당 컬렉션만 대상으로 한다.
// syncIndexes()는 스키마에 없는 인덱스를 제거하므로, 운영 DB에서 일부만
// 손보고 싶을 때는 반드시 대상을 지정해 나머지 컬렉션을 건드리지 않게 한다.
//   예) node scripts/setupDb.js packages
function selectModels(names) {
  if (names.length === 0) {
    return MODELS;
  }

  const selected = MODELS.filter((Model) => names.includes(Model.collection.name));
  const unknown = names.filter(
    (name) => !MODELS.some((Model) => Model.collection.name === name),
  );

  if (unknown.length > 0) {
    throw new Error(`알 수 없는 컬렉션: ${unknown.join(", ")}`);
  }

  return selected;
}

async function main() {
  const targets = selectModels(process.argv.slice(2));
  const conn = await connectDB();
  console.log(
    `\x1b[36m[setup-db]\x1b[0m 연결됨: ${conn.host}/${conn.name}`,
  );

  console.log(
    `\x1b[36m[setup-db]\x1b[0m 대상: ${targets.map((m) => m.collection.name).join(", ")}`,
  );

  for (const Model of targets) {
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
