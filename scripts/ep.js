const { EP_FILENAME } = require("../config/env");
const path = require("path");
const fs = require("fs");
const { EP_HEADERS, sanitizeForTsv } = require("../services/epService");

// 여러 EP 파일을 EP 헤더(49컬럼) 기준 하나의 파일로 병합한다.
// 파일마다 컬럼 구조가 달라도 각 파일의 헤더를 기준으로 값을 매칭한다.
// 사용법: node scripts/ep.js [출력파일] [입력파일...]
const DIST_DIR = path.resolve(__dirname, "../dist");

const DEFAULT_INPUTS = [
  path.join(DIST_DIR, "ire_naver_ep.packages.txt"),
  path.join(DIST_DIR, "ire_naver_ep.productMasters.txt"),
  path.join(DIST_DIR, "ire_naver_ep.products.txt"),
];

const DEFAULT_OUTPUT = path.join(DIST_DIR, EP_FILENAME);

// 옛 22컬럼 EP 파일을 입력으로 받을 때를 위한 컬럼명 대응.
// 값의 의미가 같고 위치도 같아 매핑해 옮긴다.
const COLUMN_ALIASES = {
  benefit_price: "price_mobile",
};

function readEpRows(filePath) {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");

  const headers = lines[0].split("\t");
  const rows = [];

  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const row = {};
    headers.forEach((header, i) => {
      const key = COLUMN_ALIASES[header] || header;
      row[key] = cells[i] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function main() {
  const args = process.argv.slice(2);
  const outputPath = args[0] ? path.resolve(args[0]) : DEFAULT_OUTPUT;
  const inputPaths = args.length > 1 ? args.slice(1).map((p) => path.resolve(p)) : DEFAULT_INPUTS;

  const seenIds = new Set();
  const mergedRows = [];
  let duplicated = 0;

  for (const inputPath of inputPaths) {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`파일을 찾을 수 없습니다: ${inputPath}`);
    }

    const { headers, rows } = readEpRows(inputPath);
    let added = 0;

    for (const row of rows) {
      // 같은 id가 여러 파일에 있으면 먼저 읽은 파일을 살린다.
      if (row.id && seenIds.has(row.id)) {
        duplicated += 1;
        continue;
      }
      if (row.id) seenIds.add(row.id);
      mergedRows.push(row);
      added += 1;
    }

    console.log(
      `\x1b[90m[ep]\x1b[0m ${path.basename(inputPath)}: ${rows.length}행 (${headers.length}컬럼) → ${added}행 반영`,
    );
  }

  const headerRow = EP_HEADERS.join("\t");
  const dataRows = mergedRows.map((row) =>
    EP_HEADERS.map((header) => sanitizeForTsv(row[header])).join("\t"),
  );

  fs.writeFileSync(outputPath, [headerRow, ...dataRows].join("\n"), "utf8");

  if (duplicated > 0) {
    console.log(`\x1b[33m[ep]\x1b[0m id 중복 ${duplicated}행 제외`);
  }
  console.log(
    `\x1b[32m[ep]\x1b[0m 완료: ${mergedRows.length}행 (${EP_HEADERS.length}컬럼)`,
  );
  console.log(`\x1b[32m[ep]\x1b[0m 저장 경로: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${error.message}`);
  process.exitCode = 1;
}
