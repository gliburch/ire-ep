const { prepareCronRequest } = require("./_shared");
const { runProductRefreshJob } = require("../../services/schedulerService");

module.exports = async (req, res) => {
  try {
    const prepared = await prepareCronRequest(req, res);
    if (!prepared) return;

    // 같은 경로에 여러 스케줄이 걸려 있으므로 어느 스케줄이 깨운 실행인지 남긴다.
    const schedule = req.headers["x-vercel-cron-schedule"] || "manual";
    console.log(`[cron] Product 재검증 시작 (schedule=${schedule})`);

    const result = await runProductRefreshJob(console);
    return res.status(200).json({
      success: !result.skipped,
      schedule,
      ...result,
    });
  } catch (err) {
    console.error("Cron Product 재검증 실패:", err);
    return res.status(500).json({
      success: false,
      error: err.name || "Internal Server Error",
      message: err.message,
    });
  }
};
