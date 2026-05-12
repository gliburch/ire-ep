const { prepareCronRequest } = require("./_shared");
const { runDailyFinalizeJob } = require("../../services/schedulerService");

module.exports = async (req, res) => {
  try {
    const prepared = await prepareCronRequest(req, res);
    if (!prepared) return;

    const result = await runDailyFinalizeJob({ logger: console });
    return res.status(200).json({ success: !result.skipped, ...result });
  } catch (err) {
    console.error("Cron finalize failed:", err);
    return res.status(500).json({
      success: false,
      error: err.name || "Internal Server Error",
      message: err.message,
    });
  }
};
