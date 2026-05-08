const axios = require("axios");
const apiConfig = require("../config/apiConfig");
const Product = require("../models/Product");
const ProductMaster = require("../models/ProductMaster");
const DOMESTIC_PATH_NAME = "국내여행";
const AREA_TARGET_PATH_NAMES = new Set(["해외여행", "지방출발"]);

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
 * 딜레이 헬퍼
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 모드투어 API에서 상품 정보 조회
 */
async function fetchProductFromApi(productNo) {
  const { baseUrl, endpoints, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoints.productDetail}?productNo=${productNo}`;

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
 * GNB 트리 조회
 */
async function fetchGnb() {
  const { baseUrl, endpoints, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoints.getGnb}`;

  const response = await axios.get(url, {
    headers: {
      ...headers,
      "x-incomming-pathname": "/package/search-result",
    },
  });

  if (!response.data || !response.data.isOK || !Array.isArray(response.data.result)) {
    const errorMsg =
      response.data?.errorMessages?.join(", ") || "Unknown error";
    throw new Error(`GetGnb failed: ${errorMsg}`);
  }

  return response.data.result;
}

function walkGnbTree(value, path, visit) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkGnbTree(item, path, visit);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const nextPath = value.gnbCategoryName
    ? [...path, value.gnbCategoryName]
    : path;

  visit(value, nextPath);

  for (const childValue of Object.values(value)) {
    if (childValue && typeof childValue === "object") {
      walkGnbTree(childValue, nextPath, visit);
    }
  }
}

/**
 * GetGnb 응답에서 ProductMaster 검색 대상 추출
 * - 지역 검색: areaKeywordNo
 * - 테마 검색: 국내여행 경로의 themeNo
 */
async function getProductMasterSearchTargets() {
  const gnbTree = await fetchGnb();
  const areaTargetMap = new Map();
  const themeTargetMap = new Map();

  walkGnbTree(gnbTree, [], (node, path) => {
    const hasSubCategories = Array.isArray(node.subCategories) && node.subCategories.length > 0;

    if (Array.isArray(node.areaKeywords)) {
      for (const keyword of node.areaKeywords) {
        const areaNo = Number(keyword.areaKeywordNo);
        if (
          !areaNo ||
          areaTargetMap.has(areaNo) ||
          !path.some((name) => AREA_TARGET_PATH_NAMES.has(name)) ||
          !hasSubCategories
        ) {
          continue;
        }

        areaTargetMap.set(areaNo, {
          type: "area",
          areaNo,
          name: node.gnbCategoryName || keyword.koreaName || keyword.englishName || String(areaNo),
          path,
        });
      }
    }

    if (node.themeNo && path.includes(DOMESTIC_PATH_NAME)) {
      const themeNo = Number(node.themeNo);
      if (!themeNo || themeTargetMap.has(themeNo)) return;

      themeTargetMap.set(themeNo, {
        type: "theme",
        themeNo,
        name: node.themeName || node.gnbCategoryName || String(themeNo),
        path,
      });
    }
  });

  return {
    areaTargets: Array.from(areaTargetMap.values()).sort((a, b) => a.areaNo - b.areaNo),
    themeTargets: Array.from(themeTargetMap.values()).sort((a, b) => a.themeNo - b.themeNo),
  };
}

/**
 * ProductMaster를 네이버 EP 형식으로 변환
 */
function transformProductMasterToEpData(productMaster) {
  const masterCode = productMaster.masterCode || "";
  const masterCodeNo = productMaster.masterCodeNo || "";

  // ID 생성: masterCode_PGE_IRE
  const rawId = `${masterCode}_PGE_IRE`;

  // 링크 생성
  const link = masterCodeNo
    ? `https://ire.modetour.co.kr/product-common/${masterCodeNo}?type=group`
    : "";
  const mobileLink = masterCodeNo
    ? `https://m-ire.modetour.co.kr/product-common/${masterCodeNo}?type=group`
    : "";

  // tags에서 search_tag 생성: # 제거, | 구분
  const tags = productMaster.tags || "";
  const searchTag = tags
    .split("#")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join("|")
    .slice(0, 100);

  // attribute: tags에서 # 제거, ^로 구분
  const attribute = tags
    .replace(/#/g, "")
    .replace(/\s+/g, "^")
    .slice(0, 500);

  // 출발지 + 지역명 조합
  const depatureFrom = (productMaster.depatureFrom || ["서울"])[0];
  const areas = (productMaster.areas || []).map((a) => a.name).join("/");

  // 여행 기간
  const dates = productMaster.dates || [];
  const periodInfo = dates.length > 0
    ? `${dates[0].night}박${dates[0].days}일`
    : "";

  return {
    id: sanitizeId(rawId),
    title: sanitizeTitle(productMaster.masterProductName || ""),
    price_pc: productMaster.price || 1,
    link,
    mobile_link: mobileLink,
    image_link: productMaster.image || "",
    category_name1: "여가/생활편의",
    category_name2: "해외여행",
    category_name3: "해외패키지/기타",
    category_name4: `${depatureFrom}출발 ${areas} ${periodInfo}`.trim(),
    naver_category: 50007257,
    brand: "모두투어",
    brand_certification: "Y",
    maker: "이레투어클럽",
    origin: "대한민국",
    search_tag: searchTag,
    shipping: 0,
    attribute,
    gender: "남녀공용",
  };
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

  // 속성: # 제거, 공백을 ^로 변환, 500자 제한
  const attribute = (data.groupBriefKeyword || "")
    .replace(/#/g, "")
    .replace(/\s+/g, "^")
    .slice(0, 500);

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
    title: data.productName || "", // title 클렌징 여부
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
    // 카드 할인 정보, 포인트 누락되었는데 표기해야할지
    brand: "모두투어",
    brand_certification: "Y",
    maker: "이레투어클럽",
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
    { upsert: true, returnDocument: "after" },
  );

  return product;
}

/**
 * 지역/테마별 상품 목록 조회 (SearchProductMaster)
 */
async function searchProductMaster(params) {
  const { baseUrl, endpoints, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoints.searchProductMaster}`;

  const requestBody = {
    areaNo: params.areaNo ?? 0,
    ...(params.themeNo ? { themeNo: params.themeNo } : {}),
    searchFrom: params.searchFrom,
    searchTo: params.searchTo,
    pageNo: params.pageNo || 1,
    pageSize: params.pageSize || 20,
    sortType: params.sortType || "recommand",
    ...(params.travelType ? { travelType: params.travelType } : {}),
    ...(params.deviceType ? { deviceType: params.deviceType } : {}),
    ...(params.filter ? { filter: params.filter } : {}),
  };

  const response = await axios.post(url, requestBody, { headers });

  if (!response.data || !response.data.isOK) {
    const errorMsg =
      response.data?.errorMessages?.join(", ") || "Unknown error";
    throw new Error(`SearchProductMaster failed: ${errorMsg}`);
  }

  return response.data;
}

/**
 * 출발 가능 날짜 목록 조회 (SearchMinPriceDates)
 */
async function searchMinPriceDates(productMaster, startDate, endDate) {
  const { baseUrl, endpoints, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoints.searchMinPriceDates}`;

  // productMaster에서 필요한 필드 추출
  const itemCodes = (productMaster.productCodes || []).map(
    (p) => p.computedProductCode,
  );
  const pnums = itemCodes.map(() => null);

  const requestBody = {
    groupCls: "P",
    conditionGroup: productMaster.conditionGroup || null,
    conditionGroups: null,
    startDate,
    endDate,
    itemCode: itemCodes,
    pnums,
    filter: {
      typeFilter: "PGTOverseasTravel",
      minPrice: 0,
      maxPrice: 0,
      startingPoint: productMaster.depatures || ["SEL"],
      travelConcept: [],
      transport: null,
      transportation: null,
      promotion: null,
      tourCondition: {
        airSeatClass: null,
        airPortTax: null,
        localTraffic: null,
        mealFee: null,
        dolomites: null,
        roomCharge: null,
        entranceFee: null,
        neccessaryLocalExpenses: null,
        localGuide: null,
        guideYn: null,
        shopping: null,
        freeSchedule: null,
        optionalTour: null,
      },
      depatureDay: [],
      productBrand: [],
      lodgment: [],
      travelPeriod: [],
      travelType: [],
      depatureTime: [],
      isViewAllAvaiableSeat: false,
      sort: "Hightest",
      promotions: [],
    },
  };

  const response = await axios.post(url, requestBody, { headers });

  if (!response.data || !response.data.isOK) {
    const errorMsg =
      response.data?.errorMessages?.join(", ") || "Unknown error";
    throw new Error(`SearchMinPriceDates failed: ${errorMsg}`);
  }

  return response.data.result?.priceMinDates || [];
}

/**
 * 특정 날짜 상품 상세 조회 (SearchProductDates)
 */
async function searchProductDates(productMaster, targetDate) {
  const { baseUrl, endpoints, headers } = apiConfig.modetour;
  const url = `${baseUrl}${endpoints.searchProductDates}`;

  // productMaster에서 필요한 필드 추출
  const itemCodes = (productMaster.productCodes || []).map(
    (p) => p.computedProductCode,
  );
  const pnums = itemCodes.map(() => null);

  const requestBody = {
    groupCls: "P",
    conditionGroup: productMaster.conditionGroup || null,
    conditionGroups: null,
    startDate: targetDate,
    endDate: targetDate,
    itemCode: itemCodes,
    pnums,
    filter: {
      typeFilter: "PGTOverseasTravel",
      minPrice: 0,
      maxPrice: 0,
      startingPoint: productMaster.depatures || ["SEL"],
      travelConcept: [],
      transport: null,
      transportation: null,
      promotion: null,
      tourCondition: {
        airSeatClass: null,
        airPortTax: null,
        localTraffic: null,
        mealFee: null,
        dolomites: null,
        roomCharge: null,
        entranceFee: null,
        neccessaryLocalExpenses: null,
        localGuide: null,
        guideYn: null,
        shopping: null,
        freeSchedule: null,
        optionalTour: null,
      },
      depatureDay: [],
      productBrand: [],
      lodgment: [],
      travelPeriod: [],
      travelType: [],
      depatureTime: [],
      isViewAllAvaiableSeat: false,
      sort: "Hightest",
      promotions: [],
    },
  };

  const response = await axios.post(url, requestBody, { headers });

  if (!response.data || !response.data.isOK) {
    const errorMsg =
      response.data?.errorMessages?.join(", ") || "Unknown error";
    throw new Error(`SearchProductDates failed: ${errorMsg}`);
  }

  // productMasterDetail[0].productDate 배열 반환
  const productMasterDetail = response.data.result?.productMasterDetail || [];
  if (productMasterDetail.length > 0) {
    return productMasterDetail[0].productDate || [];
  }
  return [];
}

/**
 * 단일 productDate 정보를 Product 모델에 저장
 */
async function saveProductDetail(productDate, productMaster) {
  const productNo = productDate.pnum;

  const rawData = {
    productDate,
    productMaster: {
      masterCode: productMaster.masterCode,
      masterCodeNo: productMaster.masterCodeNo,
      masterProductName: productMaster.masterProductName,
    },
  };

  const product = await Product.findOneAndUpdate(
    { productNo: Number(productNo) },
    {
      productNo: Number(productNo),
      rawData,
      departureDate: productDate.date?.sdate
        ? new Date(productDate.date.sdate)
        : null,
      arrivalDate: productDate.date?.edate
        ? new Date(productDate.date.edate)
        : null,
    },
    { upsert: true, returnDocument: "after" },
  );

  return product;
}

/**
 * 통합 수집 함수: productMaster에 대한 모든 출발일 상품 수집
 */
async function fetchAllProductDetails(productMaster, options) {
  const { startDate, endDate, delayMs = 100 } = options;

  // 1. 출발 가능 날짜 조회
  const availableDates = await searchMinPriceDates(
    productMaster,
    startDate,
    endDate,
  );

  const results = { success: [], failed: [] };

  // 2. 각 날짜별 상세 조회 및 저장
  for (const dateInfo of availableDates) {
    try {
      const details = await searchProductDates(productMaster, dateInfo.sDate);

      // 3. 각 productDate를 Product 모델에 저장
      for (const productDate of details) {
        try {
          const saved = await saveProductDetail(productDate, productMaster);
          results.success.push({
            productNo: saved.productNo,
            departureDate: productDate.date?.sdate,
          });
        } catch (err) {
          results.failed.push({
            productNo: productDate.pnum,
            departureDate: productDate.date?.sdate,
            error: err.message,
          });
        }
      }

      await sleep(delayMs);
    } catch (err) {
      results.failed.push({
        departureDate: dateInfo.sDate,
        error: err.message,
      });
    }
  }

  return {
    totalDates: availableDates.length,
    results,
  };
}

/**
 * ProductMaster를 DB에 저장 (upsert)
 * - 신규: 생성
 * - 기존: updated_at만 갱신
 */
async function saveProductMaster(master) {
  const epData = transformProductMasterToEpData(master);

  const result = await ProductMaster.findOneAndUpdate(
    { masterCode: master.masterCode },
    {
      $set: {
        masterCodeNo: master.masterCodeNo,
        rawData: master,
        epData,
      },
      $setOnInsert: {
        masterCode: master.masterCode,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  return result;
}

/**
 * 전체 ProductMaster 스크래핑 및 DB 저장
 */
async function scrapeAllProductMasters(targets, startDate, endDate, options = {}) {
  const { onProgress, delayMs = 100 } = options;
  const results = { created: 0, updated: 0, failed: 0 };
  const seenCodes = new Set();
  const normalizedTargets = Array.isArray(targets)
    ? targets.map((areaNo) => ({ type: "area", areaNo, name: String(areaNo) }))
    : [
        ...(targets?.areaTargets || []),
        ...(targets?.themeTargets || []),
      ];

  for (let i = 0; i < normalizedTargets.length; i++) {
    const target = normalizedTargets[i];
    let pageNo = 1;
    let totalPages = 1;

    do {
      try {
        const searchParams = target.type === "theme"
          ? {
              areaNo: 0,
              themeNo: target.themeNo,
              travelType: "GNBDomesticTravel",
              deviceType: "DVTPC",
              filter: {
                typeFilter: "PGTDomesticTravel",
                minPrice: 0,
                maxPrice: 0,
                startingPoint: [],
                destination: null,
                travelConcept: null,
                endLocation: null,
                transport: null,
                transportation: null,
                promotion: null,
                tourCondition: {
                  airSeatClass: null,
                  airPortTax: null,
                  localTraffic: null,
                  mealFee: null,
                  dolomites: null,
                  roomCharge: null,
                  entranceFee: null,
                  neccessaryLocalExpenses: null,
                  localGuide: null,
                  guideYn: null,
                  shopping: null,
                  freeSchedule: null,
                  optionalTour: null,
                },
                depatureDay: null,
                productBrand: null,
                lodgment: null,
                travelPeriod: null,
                travelType: ["패키지"],
                depatureTime: null,
                isViewAllAvailableSeat: true,
                sort: "Recommend",
                promotions: null,
              },
            }
          : {
              areaNo: target.areaNo,
            };

        const result = await searchProductMaster({
          ...searchParams,
          searchFrom: startDate,
          searchTo: endDate,
          pageNo,
          pageSize: 100,
        });

        totalPages = result.result.totalPages || 1;
        const masters = result.result.productMaster || [];

        for (const master of masters) {
          // 중복 체크
          if (seenCodes.has(master.masterCode)) continue;
          seenCodes.add(master.masterCode);

          try {
            const existing = await ProductMaster.findOne({
              masterCode: master.masterCode,
            });
            await saveProductMaster(master);

            if (existing) {
              results.updated++;
            } else {
              results.created++;
            }
          } catch (err) {
            results.failed++;
          }
        }

        await sleep(delayMs);
      } catch (err) {
        console.error(
          `${target.type} ${target.areaNo || target.themeNo} page ${pageNo} failed:`,
          err.message,
        );
      }

      pageNo++;
    } while (pageNo <= totalPages);

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: normalizedTargets.length,
        target,
        ...results,
      });
    }
  }

  return results;
}

module.exports = {
  fetchProductFromApi,
  fetchGnb,
  getProductMasterSearchTargets,
  transformToEpData,
  transformProductMasterToEpData,
  scrapeAndSave,
  searchProductMaster,
  searchMinPriceDates,
  searchProductDates,
  fetchAllProductDetails,
  saveProductMaster,
  scrapeAllProductMasters,
};
