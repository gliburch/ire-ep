const requiredEnvVars = [
  "MONGODB_URI",
  "MONGODB_DB",
  "FTP_HOST",
  "FTP_USER",
  "FTP_PASSWORD",
  "FTP_BASE_URL",
  "MODETOUR_API_KEY",
  "MODETOUR_WEBSITE_NO",
  "MODETOUR_COMPANY_NO",
];

function getEnv(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

function validateEnv() {
  const missing = requiredEnvVars.filter((name) => !getEnv(name));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

function getModetourHeader() {
  return {
    WebSiteNo: Number(getEnv("MODETOUR_WEBSITE_NO")),
    CompanyNo: Number(getEnv("MODETOUR_COMPANY_NO")),
    DeviceType: getEnv("MODETOUR_DEVICE_TYPE", "DVTPC"),
    ApiKey: getEnv("MODETOUR_API_KEY"),
  };
}

module.exports = {
  getEnv,
  validateEnv,
  getModetourHeader,
};
