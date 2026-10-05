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
  CRON_TIMEZONE,
  PRODUCT_MASTER_SCRAPE_MONTHS,
  EP_OVERRIDE_SHEET_URL,
  EP_FILENAME,
  EP_FILENAME_EXCLUDED,
  EP_MAX_ITEMS,
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
  CRON_TIMEZONE,
  PRODUCT_MASTER_SCRAPE_MONTHS,
  EP_OVERRIDE_SHEET_URL,
  EP_FILENAME,
  EP_FILENAME_EXCLUDED,
  EP_MAX_ITEMS,
};

const missing = Object.keys(required).filter((key) => !required[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`,
  );
}

module.exports = {
  ...required,
  // EP 한 번에 담을 최대 상품 수. 전량을 담으면 생성이 함수 실행시간 한도를 넘는다.
  EP_MAX_ITEMS: Number(EP_MAX_ITEMS),
};
