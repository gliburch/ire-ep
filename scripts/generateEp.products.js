const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Product = require("../models/Product");
const { EP_HEADERS, sanitizeForTsv } = require("../services/epService");

function productToTsvRow(epData) {
  return EP_HEADERS.map((header) => sanitizeForTsv(epData[header])).join("\t");
}

async function main() {
  await connectDB();

  console.log("\x1b[36m[generate-ep]\x1b[0m Product 기준 EP 파일 생성 시작");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const products = await Product.find({
    departureDate: { $gte: today },
    epData: { $exists: true, $ne: null },
  }).lean();

  const headerRow = EP_HEADERS.join("\t");
  const dataRows = products.map((p) => productToTsvRow(p.epData));
  const content = [headerRow, ...dataRows].join("\n");

  const distDir = path.resolve(__dirname, "../dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log(`\x1b[90m[generate-ep]\x1b[0m /dist 폴더 생성됨`);
  }

  const outputPath = path.join(distDir, "ire_naver_ep.products.txt");
  fs.writeFileSync(outputPath, content, "utf8");

  console.log(`\x1b[32m[generate-ep]\x1b[0m 완료: ${products.length}개 상품`);
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
