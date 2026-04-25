const axios = require('axios');
const apiConfig = require('../config/apiConfig');
const Product = require('../models/Product');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 모드투어 API에서 상품 정보 조회
 */
async function fetchProductFromApi(productNo) {
  const { baseUrl, endpoint, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoint}?productNo=${productNo}`;

  const response = await axios.get(url, {
    headers: {
      ...headers,
      'x-incomming-pathname': `/package/${productNo}`,
    },
  });

  if (!response.data || !response.data.isOK) {
    const errorMsg = response.data?.errorMessages?.join(', ') || 'Unknown error';
    throw new Error(`Invalid API response: ${errorMsg}`);
  }

  return response.data;
}

/**
 * rawData를 네이버 EP 형식으로 변환
 */
function transformToEpData(rawData) {
  const data = rawData.result || {};
  const productMaster = data.productMaster || [];
  const representativeProduct = data.representativeProduct || [];
  const listAreaImages = data.listAreaImages || [];
  const themes = data.themes || [];
  const badges = data.badges || {};
  const visitCities = data.visitCities || [];
  const similarWords = data.similarWords || [];

  // 대표 이미지: representativeProduct 첫 번째 또는 productMaster 이미지
  const mainImage =
    representativeProduct[0]?.url || productMaster[0]?.image || '';

  // 추가 이미지: representativeProduct (첫 번째 제외) + listAreaImages
  const additionalImages = [
    ...representativeProduct.slice(1).map((p) => p.url).filter(Boolean),
    ...listAreaImages.map((p) => p.image).filter(Boolean),
  ].join('|');

  // themes를 문자열로
  const themeNames = themes.map((t) => t.themeName || t).join(',');

  // goods_type 조합
  const goodsTypeParts = [
    data.isDomestic ? '국내' : '해외',
    data.groupClassification,
    data.transportationMethod,
    data.travelType,
    themeNames,
  ].filter(Boolean);

  // origin 조합
  const citiesStr = visitCities.map((c) => c.cityName || c).join(',');
  const originParts = [data.category2, data.countryUnique, citiesStr].filter(
    Boolean
  );

  // event_words 조합
  const eventWordsParts = [
    data.groupBriefKeyword,
    data.promotionName,
    data.tags,
    similarWords.join(','),
    data.descriptions,
  ].filter(Boolean);

  // search_tag 조합
  const searchTagParts = [data.groupBriefKeyword, data.keyword, data.tags].filter(
    Boolean
  );

  // attribute 조합
  const attributeParts = [
    data.includedNote,
    data.unincludedNote,
    data.noticeNote,
    data.specificNote,
  ].filter(Boolean);

  // option_detail 조합
  const optionDetailParts = [
    data.flightCode,
    data.departureFlight,
    data.arrivalFlight,
    data.transportName,
  ].filter(Boolean);

  // 링크 생성
  const groupNumber = data.groupNumber || '';
  const link = groupNumber
    ? `https://ire.modetour.co.kr/package/${groupNumber}`
    : '';

  // coupon 조합
  const couponParts = [];
  if (badges.existsCoupon) couponParts.push('쿠폰');
  if (data.promotionName) couponParts.push(data.promotionName);

  return {
    id: data.productCode2 || String(data.groupNumber) || '',
    title: data.productName || '',
    price_pc: data.sellingPriceAdultTotalAmount || 0,
    price_mobile: data.sellingPriceAdultTotalAmount || 0,
    normal_price: data.productPriceAdultTotalAmount || 0,
    link: link,
    mobile_link: link,
    image_link: mainImage,
    add_image_link: additionalImages,
    category_name1: data.category1 || '',
    category_name2: data.category2 || '',
    category_name3: data.category3 || '',
    category_name4: themeNames || data.groupClassification || '',
    product_flag: themeNames || data.groupClassification || '',
    goods_type: goodsTypeParts.join(' > '),
    model_number: data.productCode2 || data.computedProductCode || '',
    brand: data.transportName || data.marketingAirName || '',
    maker: data.transportName || data.marketingAirName || '',
    origin: originParts.join(' > '),
    event_words: eventWordsParts.join(' | '),
    coupon: couponParts.join(' | '),
    point: data.accumulationExpectedTourMileage || 0,
    search_tag: searchTagParts.join(','),
    group_id: data.masterCodeId || String(data.groupNumber) || '',
    minimum_purchase_quantity: data.minimumDepartureNumberOfPeople || 1,
    delivery_grade: [data.reserveStatusKorean, data.productState?.state]
      .filter(Boolean)
      .join(' | '),
    delivery_detail: [
      data.departureDate,
      data.arrivalDate,
      data.travelPeriod,
      data.departureCityName,
      data.arrivalCityName,
    ]
      .filter(Boolean)
      .join(' | '),
    attribute: attributeParts.join(' | '),
    option_detail: optionDetailParts.join(' | '),
    seller_id: groupNumber,
    naver_category: '',
    condition: 'new',
    age_group: '성인',
    gender: '남녀공용',
  };
}

/**
 * 상품 스크래핑 후 DB 저장 (upsert)
 */
async function scrapeAndSave(productNo) {
  const apiResponse = await fetchProductFromApi(productNo);
  const rawData = apiResponse.result || {};
  const epData = transformToEpData(apiResponse);

  const product = await Product.findOneAndUpdate(
    { productNo: Number(productNo) },
    {
      productNo: Number(productNo),
      rawData,
      epData,
      departureDate: rawData.departureDate ? new Date(rawData.departureDate) : null,
      arrivalDate: rawData.arrivalDate ? new Date(rawData.arrivalDate) : null,
    },
    { upsert: true, new: true }
  );

  return product;
}

/**
 * 여러 상품 일괄 스크래핑
 */
async function scrapeMultiple(productNos) {
  const results = { success: [], failed: [] };

  for (const productNo of productNos) {
    try {
      const product = await scrapeAndSave(productNo);
      results.success.push({ productNo, id: product._id });
    } catch (err) {
      results.failed.push({ productNo, error: err.message });
    }
    await sleep(100); // Rate limiting
  }

  return results;
}

/**
 * 범위 스크래핑 (최신 상품부터 역순)
 */
async function scrapeRange(startNo, count = 100) {
  let currentNo = parseInt(startNo, 10);
  let successCount = 0;
  const results = { success: [], failed: [], skipped: [] };

  while (successCount < count && currentNo > 0) {
    try {
      await scrapeAndSave(currentNo.toString());
      results.success.push(currentNo);
      successCount++;
    } catch (err) {
      if (
        err.response?.status === 404 ||
        err.message.includes('Invalid')
      ) {
        results.skipped.push(currentNo);
      } else {
        results.failed.push({ productNo: currentNo, error: err.message });
      }
    }
    currentNo--;
    await sleep(100); // Rate limiting
  }

  return results;
}

module.exports = {
  fetchProductFromApi,
  transformToEpData,
  scrapeAndSave,
  scrapeMultiple,
  scrapeRange,
};
