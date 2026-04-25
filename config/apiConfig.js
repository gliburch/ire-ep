module.exports = {
  modetour: {
    baseUrl: 'https://onbp-api.modetour.com',
    endpoint: '/Package/GetProductDetailInfo',
    headers: {
      'ModeWebApiReqHeader': JSON.stringify({
        WebSiteNo: 6352,
        CompanyNo: 1616824,
        DeviceType: 'DVTPC',
        ApiKey: 'jm9i5RUzKPMPdklHzDKqN5onqdjfelefL0vsCOey7qKCuK7n0PgecAwriFX9iWtCai/im6QEbqU4NhRGPm7Y/w==',
      }),
      'X-Platform': 'ModeEcommerce',
      'X-SalesPartner': '6352',
      'X-UserDepartment': 'ModeEcommerce',
      'X-UserId': '',
      'X-UserName': '',
      'Origin': 'https://ire.modetour.co.kr',
      'Referer': 'https://ire.modetour.co.kr/',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
  },
};
