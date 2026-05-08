const { getEnv, getModetourHeader } = require("./env");

module.exports = {
  modetour: {
    baseUrl: getEnv("MODETOUR_BASE_URL", "https://onbp-api.modetour.com"),
    endpoints: {
      getGnb: "/Common/GetGnb",
      productDetail: "/Package/GetProductDetailInfo",
      searchProductMaster: "/Package/SearchProductMaster",
      searchMinPriceDates: "/Package/SearchMinPriceDates",
      searchProductDates: "/Package/SearchProductDates",
    },
    headers: {
      ModeWebApiReqHeader: JSON.stringify(getModetourHeader()),
      ...(getEnv("MODETOUR_AUTHORIZATION")
        ? { Authorization: getEnv("MODETOUR_AUTHORIZATION") }
        : {}),
      "X-Platform": getEnv("MODETOUR_X_PLATFORM", "ModeEcommerce"),
      "X-SalesPartner": getEnv("MODETOUR_X_SALES_PARTNER", "6352"),
      "X-UserDepartment": getEnv("MODETOUR_X_USER_DEPARTMENT", "ModeEcommerce"),
      "X-UserId": getEnv("MODETOUR_X_USER_ID", ""),
      "X-UserName": getEnv("MODETOUR_X_USER_NAME", ""),
      Origin: getEnv("MODETOUR_ORIGIN", "https://ire.modetour.co.kr"),
      Referer: getEnv("MODETOUR_REFERER", "https://ire.modetour.co.kr/"),
      Accept: "application/json, text/plain, */*",
      "User-Agent": getEnv(
        "MODETOUR_USER_AGENT",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      ),
    },
  },
};
