const { prepareCronRequest } = require("./_shared");
const { runDailyScrapeBatch } = require("../../services/schedulerService");

module.exports = async (req, res) => {
  try {
    const prepared = await prepareCronRequest(req, res);
    if (!prepared) return;

    const result = await runDailyScrapeBatch(4, { logger: console });
    return res.status(200).json({ success: !result.skipped, ...result });
  } catch (err) {
    console.error("Cron batch 5 failed:", err);
    return res.status(500).json({
      success: false,
      error: err.name || "Internal Server Error",
      message: err.message,
    });
  }
};
