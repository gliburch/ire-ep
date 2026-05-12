require("dotenv").config();

const { validateEnv, getEnv } = require("../../config/env");
const { connectDB } = require("../../config/db");
const { runDailyScrapeJob } = require("../../services/schedulerService");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed",
    });
  }

  const cronSecret = getEnv("CRON_SECRET");
  if (cronSecret) {
    const authorization = req.headers.authorization || "";
    if (authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }
  }

  try {
    validateEnv();
    await connectDB(console);
    const result = await runDailyScrapeJob(console);

    return res.status(200).json({
      success: !result.skipped,
      ...result,
    });
  } catch (err) {
    console.error("Vercel daily scrape failed:", err);
    return res.status(500).json({
      success: false,
      error: err.name || "Internal Server Error",
      message: err.message,
    });
  }
};
