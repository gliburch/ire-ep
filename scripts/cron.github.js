require("../config/env");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const {
  runProductRefreshJob,
  runProductCollectJob,
  publishProductEpFile,
} = require("../services/schedulerService");

const MINUTE = 60 * 1000;

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? Number(hit.slice(prefix.length)) : fallback;
}

// GitHub Actions에서 하루 1회 길게 돈다. 재검증 → 수집 → EP 업로드 순서.
// 수집은 구간을 선점하고 비정상 종료 시 lastNo가 남지 않으므로,
// 큰 구간 하나 대신 기본 크기 묶음을 시간이 다할 때까지 이어서 돈다.
async function main() {
  const refreshMinutes = parseArg("refresh-minutes", 25);
  const collectMinutes = parseArg("collect-minutes", 25);

  await connectDB(console);

  const refresh = await runProductRefreshJob(console, {
    limit: 50000,
    timeBudgetMs: refreshMinutes * MINUTE,
  });
  console.log(
    `[refresh] processed=${refresh.processedCount ?? 0}/${refresh.targetCount ?? 0} skipped=${Boolean(refresh.skipped)}`,
  );

  const collectDeadline = Date.now() + collectMinutes * MINUTE;
  let collectedRuns = 0;

  while (Date.now() < collectDeadline) {
    const result = await runProductCollectJob(console, {
      timeBudgetMs: collectDeadline - Date.now(),
      });
    if (result.skipped || result.error || result.stoppedEarly) break;
    collectedRuns += 1;
    console.log(`[collect] #${collectedRuns} ${result.startNo}~${result.lastNo}`);
  }

  const ep = await publishProductEpFile(console);
  console.log(`[ep] count=${ep.count} excluded=${ep.excludedCount} ${ep.url}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
