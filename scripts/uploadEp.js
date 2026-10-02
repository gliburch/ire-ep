const { EP_FILENAME } = require("../config/env");
const path = require("path");
const fs = require("fs");
const { uploadEpFileFromPath } = require("../services/ftpService");

// dist의 EP 파일을 FTP의 /www/ep 아래로 업로드한다.
// 사용법: node scripts/uploadEp.js [로컬파일경로] [원격파일명]

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function main() {
  const args = process.argv.slice(2);
  const localPath = args[0]
    ? path.resolve(args[0])
    : path.resolve(__dirname, "../dist", EP_FILENAME);
  const filename = args[1] || path.basename(localPath);

  if (!fs.existsSync(localPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${localPath}`);
  }

  const totalBytes = fs.statSync(localPath).size;
  console.log(`\x1b[36m[upload-ep]\x1b[0m ${localPath} (${formatMb(totalBytes)}) 업로드 시작`);
  console.log(`\x1b[90m[upload-ep]\x1b[0m 대상: ep/${filename}`);

  // 진행률은 같은 줄을 덮어쓰며 표시한다.
  let lastLogged = 0;
  const url = await uploadEpFileFromPath(localPath, filename, ({ bytes }) => {
    if (bytes - lastLogged < 5 * 1024 * 1024) return;
    lastLogged = bytes;
    const percent = ((bytes / totalBytes) * 100).toFixed(1);
    process.stdout.write(`\r\x1b[90m[upload-ep]\x1b[0m ${formatMb(bytes)} / ${formatMb(totalBytes)} (${percent}%)`);
  });
  process.stdout.write("\n");

  console.log(`\x1b[32m[upload-ep]\x1b[0m 완료: ${url}`);
}

main().catch((error) => {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${error.message}`);
  process.exitCode = 1;
});
