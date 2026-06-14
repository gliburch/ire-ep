const dotenv = require('dotenv')
dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env.local' });

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
} = process.env;

const missing = Object.keys(module.exports).filter((key) => !module.exports[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`,
  );
}

module.exports = {
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
};
