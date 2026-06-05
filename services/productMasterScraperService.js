const axios = require("axios");
const apiConfig = require("../config/apiConfig");
const ProductMaster = require("../models/ProductMaster");
const {
  createFtpClient,
  uploadImageToFtp,
  resetImageUploadCache,
} = require("./ftpService");
const {
  sanitizeId,
  sanitizeTitle,
  sleep,
  walkGnbTree,
} = require("./scraperUtils");
const DOMESTIC_PATH_NAME = "국내여행";
const AREA_TARGET_PATH_NAMES = new Set(["해외여행", "지방출발"]);
const DOMESTIC_NAVER_CATEGORY = 50007253;
const OVERSEAS_NAVER_CATEGORY = 50007257;

async function uploadEpImagesForNewMaster(epData, client) {
  if (!client || !epData) {
    return epData;
  }

  const nextEpData = { ...epData };

  if (nextEpData.image_link && !nextEpData.image_link.includes("cafe24.com")) {
    nextEpData.image_link = await uploadImageToFtp(client, nextEpData.image_link);
  }

  if (nextEpData.add_image_link && !nextEpData.add_image_link.includes("cafe24.com")) {
    const uploadedUrls = [];

    for (const url of nextEpData.add_image_link.split("|").filter(Boolean)) {
      uploadedUrls.push(await uploadImageToFtp(client, url));
    }

    nextEpData.add_image_link = uploadedUrls.join("|");
  }

  return nextEpData;
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
function transformProductMasterToEpData(productMaster, options = {}) {
  const { target } = options;
  const masterCode = productMaster.masterCode || "";
  const masterCodeNo = productMaster.masterCodeNo || "";
  const isDomestic = target?.type === "theme";

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

  const categories = isDomestic
    ? {
        category_name2: "국내여행",
        category_name3: "국내패키지/기타",
        naver_category: DOMESTIC_NAVER_CATEGORY,
      }
    : {
        category_name2: "해외여행",
        category_name3: "해외패키지/기타",
        naver_category: OVERSEAS_NAVER_CATEGORY,
      };

  return {
    id: sanitizeId(rawId),
    title: sanitizeTitle(productMaster.masterProductName || ""),
    price_pc: productMaster.price || 1,
    link,
    mobile_link: mobileLink,
    image_link: productMaster.image || "",
    category_name1: "여가/생활편의",
    category_name2: categories.category_name2,
    category_name3: categories.category_name3,
    category_name4: `${depatureFrom}출발 ${areas} ${periodInfo}`.trim(),
    naver_category: categories.naver_category,
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
 * ProductMaster를 DB에 저장
 * - 신규: 이미지 FTP 업로드 후 생성
 * - 기존: updated_at만 갱신
 */
async function saveProductMaster(master, target, options = {}) {
  const { ftpClient = null } = options;
  const existing = await ProductMaster.findOne({
    masterCode: master.masterCode,
  }).select("_id");

  if (existing) {
    await ProductMaster.updateOne(
      { _id: existing._id },
      { $currentDate: { updated_at: true } },
    );

    return { status: "updated" };
  }

  const epData = transformProductMasterToEpData(master, { target });
  const uploadedEpData = await uploadEpImagesForNewMaster(epData, ftpClient);

  await ProductMaster.create({
    masterCode: master.masterCode,
    masterCodeNo: master.masterCodeNo,
    rawData: {
      ...master,
      _searchTarget: target || null,
    },
    epData: uploadedEpData,
  });

  return { status: "created" };
}

/**
 * 전체 ProductMaster 스크래핑 및 DB 저장
 */
async function scrapeAllProductMasters(targets, startDate, endDate, options = {}) {
  const {
    onProgress,
    delayMs = 100,
  } = options;
  const results = { created: 0, updated: 0, failed: 0 };
  const seenCodes = new Set();
  const normalizedTargets = Array.isArray(targets)
    ? targets.map((target) => (
        target && typeof target === "object"
          ? target
          : { type: "area", areaNo: target, name: String(target) }
      ))
    : [
        ...(targets?.areaTargets || []),
        ...(targets?.themeTargets || []),
      ];

  resetImageUploadCache();

  let ftpClient = null;

  try {
    ftpClient = await createFtpClient();

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
            if (seenCodes.has(master.masterCode)) continue;
            seenCodes.add(master.masterCode);

            try {
              const saveResult = await saveProductMaster(master, target, { ftpClient });

              if (saveResult.status === "created") {
                results.created++;
              } else if (saveResult.status === "updated") {
                results.updated++;
              }
            } catch (err) {
              results.failed++;

              if (err.message.includes("Timeout") || err.message.includes("closed")) {
                try {
                  ftpClient.close();
                } catch {}
                ftpClient = await createFtpClient();
              }
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
  } finally {
    if (ftpClient) {
      ftpClient.close();
    }
  }

  return results;
}

module.exports = {
  getProductMasterSearchTargets,
  scrapeAllProductMasters,
};
