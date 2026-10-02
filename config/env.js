const dotenv = require("dotenv");

// 로컬에서는 .env.local, 프로덕션(NODE_ENV=production)에서는 .env를 사용한다.
// Vercel 등 환경변수가 주입되는 환경에서는 파일이 없어도 process.env 값이 그대로 쓰인다.
dotenv.config({
  path: process.env.NODE_ENV === "production" ? ".env" : ".env.local",
  quiet: true,
});

const {
  MONGODB_URI,
  MONGODB_DB,
  PORT,
  FTP_HOST,
  FTP_USER,
  FTP_PASSWORD,
  FTP_BASE_URL,
  MODETOUR_API_KEY,
  MODETOUR_WEBSITE_NO,
  MODETOUR_COMPANY_NO,
  MODETOUR_DEVICE_TYPE,
  CRON_SECRET,
  DAILY_SCRAPE_BATCH_COUNT,
  DAILY_BATCH_TIMEZONE,
  PRODUCT_MASTER_SCRAPE_MONTHS,
  EP_OVERRIDE_SHEET_URL,
  EP_FILENAME,
} = process.env;

const required = {
  MONGODB_URI,
  MONGODB_DB,
  PORT,
  FTP_HOST,
  FTP_USER,
  FTP_PASSWORD,
  FTP_BASE_URL,
  MODETOUR_API_KEY,
  MODETOUR_WEBSITE_NO,
  MODETOUR_COMPANY_NO,
  MODETOUR_DEVICE_TYPE,
  CRON_SECRET,
  DAILY_SCRAPE_BATCH_COUNT,
  DAILY_BATCH_TIMEZONE,
  PRODUCT_MASTER_SCRAPE_MONTHS,
  EP_OVERRIDE_SHEET_URL,
};

// 비어 있어도 기본값으로 동작하는 값들.
const optional = {
  // 최종 EP 산출물 및 FTP 업로드 파일명.
  EP_FILENAME: EP_FILENAME || "ire_naver_ep.txt",
};

module.exports = { ...required, ...optional };

const missing = Object.keys(required).filter((key) => !required[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`,
  );
}
