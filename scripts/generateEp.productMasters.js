const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { generateEpFileFromDb } = require("../services/epService");

async function main() {
  await connectDB();

  console.log("\x1b[36m[generate-ep]\x1b[0m ProductMaster 기준 EP 파일 생성 시작");

  const result = await generateEpFileFromDb({ recentOnly: false });

  const distDir = path.resolve(__dirname, "../dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log(`\x1b[90m[generate-ep]\x1b[0m /dist 폴더 생성됨`);
  }

  const outputPath = path.join(distDir, "ire_naver_ep.productMasters.txt");
  fs.writeFileSync(outputPath, result.content, "utf8");

  console.log(`\x1b[32m[generate-ep]\x1b[0m 완료: ${result.count}개 상품`);
  console.log(`\x1b[32m[generate-ep]\x1b[0m 저장 경로: ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
