const {
  MODETOUR_WEBSITE_NO,
  MODETOUR_COMPANY_NO,
  MODETOUR_DEVICE_TYPE,
  MODETOUR_API_KEY,
} = require("./env");

module.exports = {
  modetour: {
    baseUrl: "https://onbp-api.modetour.com",
    endpoints: {
      getGnb: "/Common/GetGnb",
      searchProductMaster: "/Package/SearchProductMaster",
      productDetail: "/Package/GetProductDetailInfo",
      searchMinPriceDates: "/Package/SearchMinPriceDates",
      searchProductDates: "/Package/SearchProductDates",
    },
    headers: {
      ModeWebApiReqHeader: JSON.stringify({
        WebSiteNo: Number(MODETOUR_WEBSITE_NO),
        CompanyNo: Number(MODETOUR_COMPANY_NO),
        DeviceType: MODETOUR_DEVICE_TYPE,
        ApiKey: MODETOUR_API_KEY,
      }),
      "X-Platform": "ModeEcommerce",
      "X-SalesPartner": "6352",
      "X-UserDepartment": "ModeEcommerce",
      "X-UserId": "",
      "X-UserName": "",
      Origin: "https://ire.modetour.co.kr",
      Referer: "https://ire.modetour.co.kr/",
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    },
  },
};
