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

async function refresh(minutes) {
  const result = await runProductRefreshJob(console, {
    limit: 50000,
    timeBudgetMs: minutes * MINUTE,
  });
  console.log(
    `[refresh] processed=${result.processedCount ?? 0}/${result.targetCount ?? 0} skipped=${Boolean(result.skipped)}`,
  );
}

// 수집은 구간을 선점하고 비정상 종료 시 lastNo가 남지 않으므로,
// 큰 구간 하나 대신 기본 크기 묶음을 시간이 다할 때까지 이어서 돈다.
async function collect(minutes) {
  const deadline = Date.now() + minutes * MINUTE;
  let runs = 0;

  while (Date.now() < deadline) {
    const result = await runProductCollectJob(console, {
      timeBudgetMs: deadline - Date.now(),
    });
    if (result.error) {
      console.error(`[collect] ${result.error}`);
      process.exitCode = 1;
    }
    if (result.skipped || result.error || result.stoppedEarly) break;
    runs += 1;
    console.log(`[collect] #${runs} ${result.startNo}~${result.lastNo}`);
  }
}

async function ep() {
  const result = await publishProductEpFile(console);
  console.log(`[ep] count=${result.count} excluded=${result.excludedCount} ${result.url}`);
}

const TASKS = {
  refresh: () => refresh(parseArg("minutes", 25)),
  collect: () => collect(parseArg("minutes", 25)),
  ep,
};

async function main() {
  const task = TASKS[process.argv[2]];
  if (!task) {
    throw new Error(`사용법: node scripts/cron.github.js <${Object.keys(TASKS).join("|")}> [--minutes=N]`);
  }

  await connectDB(console);
  await task();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
