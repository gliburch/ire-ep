require("dotenv").config();

const { validateEnv, getEnv } = require("../../config/env");
const { connectDB } = require("../../config/db");

function ensureCronSecret(req, res) {
  const cronSecret = getEnv("CRON_SECRET");

  if (!cronSecret) {
    res.status(500).json({
      success: false,
      error: "Missing CRON_SECRET",
    });
    return false;
  }

  const authorization = req.headers.authorization || "";
  if (authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
    return false;
  }

  return true;
}

async function prepareCronRequest(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({
      success: false,
      error: "Method Not Allowed",
    });
    return false;
  }

  if (!ensureCronSecret(req, res)) {
    return false;
  }

  validateEnv();
  await connectDB(console);
  return true;
}

module.exports = {
  prepareCronRequest,
};
