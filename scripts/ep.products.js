require("../config/env");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { generateProductEpFile } = require("../services/epService");

async function main() {
  await connectDB();

  console.log("\x1b[36m[ep]\x1b[0m Product 기준 EP 파일 생성 시작");

  const { main: mainFile, excluded } = await generateProductEpFile({ futureOnly: true });

  const distDir = path.resolve(__dirname, "../dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log("\x1b[90m[ep]\x1b[0m /dist 폴더 생성됨");
  }

  const mainPath = path.join(distDir, "ire_naver_ep.products.txt");
  fs.writeFileSync(mainPath, mainFile.content, "utf8");
  console.log(`\x1b[32m[ep]\x1b[0m 완료: ${mainFile.count}개 상품 → ${mainPath}`);

  const excludedPath = path.join(distDir, "ire_naver_ep.products.excluded.txt");
  fs.writeFileSync(excludedPath, excluded.content, "utf8");
  console.log(`\x1b[32m[ep]\x1b[0m 제외: ${excluded.count}개 상품 → ${excludedPath}`);
}

main()
  .catch((error) => {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
