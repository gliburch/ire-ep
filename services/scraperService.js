const axios = require("axios");
const apiConfig = require("../config/apiConfig");
const Product = require("../models/Product");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 네이버 EP 상품 ID 정제
 * - 영문, 숫자, -(hyphen), _(underscore), 공백만 허용
 * - 최대 50자
 */
function sanitizeId(value) {
  if (!value) {
    throw new Error("상품 ID가 없습니다");
  }
  const sanitized = String(value).replace(/[^a-zA-Z0-9\-_ ]/g, "");
  if (!sanitized) {
    throw new Error("유효한 상품 ID가 없습니다");
  }
  return sanitized.slice(0, 50);
}

/**
 * 네이버 EP 상품명 정제
 * - 제어문자(탭, 엔터 등) 제거
 * - 연속 공백 정리
 * - 최대 100자 (글자 단위)
 */
function sanitizeTitle(value) {
  if (!value) {
    throw new Error("상품명이 없습니다");
  }
  const sanitized = String(value)
    .replace(/[\t\n\r\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) {
    throw new Error("유효한 상품명이 없습니다");
  }
  return sanitized.slice(0, 100);
}

/**
 * 모드투어 API에서 상품 정보 조회
 */
async function fetchProductFromApi(productNo) {
  const { baseUrl, endpoint, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoint}?productNo=${productNo}`;

  const response = await axios.get(url, {
    headers: {
      ...headers,
      "x-incomming-pathname": `/package/${productNo}`,
    },
  });

  if (!response.data || !response.data.isOK) {
    const errorMsg =
      response.data?.errorMessages?.join(", ") || "Unknown error";
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
  const badges = data.badges || {};
  // 대표 이미지: representativeProduct 첫 번째 또는 productMaster 이미지
  const mainImage =
    representativeProduct[0]?.url || productMaster[0]?.image || "";

  const attribute = data.groupBriefKeyword.replace("#", "").replace(" ", "^");

  // 추가 이미지: representativeProduct (첫 번째 제외) + listAreaImages
  // 최대 10개, 2000자 제한
  const additionalImages = [
    ...representativeProduct
      .slice(1)
      .map((p) => p.url)
      .filter(Boolean),
    ...listAreaImages.map((p) => p.image).filter(Boolean),
  ]
    .slice(0, 10)
    .join("|")
    .slice(0, 2000);

  // search_tag 조합
  const searchTag = data.keyword
    .split(",")
    .slice(0, 10)
    .join("|")
    .slice(0, 100);

  // 링크 생성
  const groupNumber = data.groupNumber || "";
  const link = groupNumber
    ? `https://ire.modetour.co.kr/package/${groupNumber}`
    : "";

  const mobileLink = groupNumber
    ? `https://m-ire.modetour.co.kr/package/${groupNumber}`
    : "";

  // coupon 조합
  const couponParts = [];
  if (badges.existsCoupon) couponParts.push("쿠폰");
  if (data.promotionName) couponParts.push(data.promotionName);

  // ID 생성: productCode_groupNumber_PGE_IRE
  const productCode = data.productCode || data.productCode2 || "";
  const rawId = `${productCode}_${groupNumber}_PGE_IRE`;

  return {
    // 필수: id, title, price_pc, link, image_link, category_name1, shipping
    id: sanitizeId(rawId),
    title: data.productName || "",
    price_pc: data.benefitPriceInfo?.price || 1,
    benefit_price: data.benefitPriceInfo?.discountPrice || 1,
    normal_price: data.productPriceAdultTotalAmount || 1,
    link: link,
    mobile_link: mobileLink,
    image_link: mainImage,
    add_image_link: additionalImages,
    category_name1: "여가/생활편의",
    category_name2: "해외여행",
    category_name3: "해외패키지/기타",
    category_name4:
      data.koreanArrivalCityName +
      "출발" +
      data.arrivalCityName +
      data.groupClassification,
    naver_category: 50007257,
    brand: "모두투어",
    brand_certification: "Y",
    maker: "모두투어",
    origin: "대한민국",
    search_tag: searchTag,
    shipping: 0,
    attribute: attribute,
    gender: "남녀공용",
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
      departureDate: rawData.departureDate
        ? new Date(rawData.departureDate)
        : null,
      arrivalDate: rawData.arrivalDate ? new Date(rawData.arrivalDate) : null,
    },
    { upsert: true, new: true },
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
      if (err.response?.status === 404 || err.message.includes("Invalid")) {
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
