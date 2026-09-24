require("../config/env");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { generateLegacyEpFile } = require("../services/epService");

async function main() {
  await connectDB();

  console.log("\x1b[36m[ep]\x1b[0m 구 컬렉션(productmasters) 기준 EP 파일 생성 시작");

  // updatedFrom 없이 호출하면 구 컬렉션에 남아 있는 전체 데이터를 대상으로 한다.
  const result = await generateLegacyEpFile();

  const distDir = path.resolve(__dirname, "../dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log("\x1b[90m[ep]\x1b[0m /dist 폴더 생성됨");
  }

  const outputPath = path.join(distDir, "ire_naver_ep.productMasters.txt");
  fs.writeFileSync(outputPath, result.content, "utf8");

  console.log(`\x1b[32m[ep]\x1b[0m 완료: ${result.count}개 상품`);
  console.log(`\x1b[32m[ep]\x1b[0m 저장 경로: ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
