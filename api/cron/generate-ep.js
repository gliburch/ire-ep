const { prepareCronRequest } = require("./_shared");
const { runEpGenerateJob } = require("../../services/schedulerService");

module.exports = async (req, res) => {
  try {
    const prepared = await prepareCronRequest(req, res);
    if (!prepared) return;

    const schedule = req.headers["x-vercel-cron-schedule"] || "manual";
    console.log(`[cron] EP 생성 시작 (schedule=${schedule})`);

    const result = await runEpGenerateJob(console);
    return res.status(200).json({
      success: true,
      schedule,
      ...result,
    });
  } catch (err) {
    console.error("Cron EP 생성 실패:", err);
    return res.status(500).json({
      success: false,
      error: err.name || "Internal Server Error",
      message: err.message,
    });
  }
};
