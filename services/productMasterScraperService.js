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
} = require("./scraperUtils");
const DOMESTIC_NAVER_CATEGORY = 50007253;
const OVERSEAS_NAVER_CATEGORY = 50007257;

/**
 * ProductMaster를 최종 네이버 EP 형식으로 생성
 * - 기본 EP 필드 생성
 * - 이미지 URL을 FTP URL로 치환
 */
async function buildProductMasterEpData(productMaster, options = {}) {
  const { searchTarget, ftpClient = null } = options;
  const masterCode = productMaster.masterCode || "";
  const masterCodeNo = productMaster.masterCodeNo || "";
  const isDomestic = searchTarget?.type === "theme";
  const imageLink = productMaster.image
    ? (ftpClient ? await uploadImageToFtp(ftpClient, productMaster.image) : productMaster.image)
    : "";

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

  const epData = {
    id: sanitizeId(rawId),
    title: sanitizeTitle(productMaster.masterProductName || ""),
    price_pc: productMaster.price || 1,
    link,
    mobile_link: mobileLink,
    image_link: imageLink,
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

  return epData;
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
async function saveProductMaster(productMaster, searchTarget, options = {}) {
  const { ftpClient = null } = options;
  const existing = await ProductMaster.findOne({
    masterCode: productMaster.masterCode,
  }).select("_id");

  if (existing) {
    await ProductMaster.updateOne(
      { _id: existing._id },
      { $currentDate: { updated_at: true } },
    );

    return { status: "updated" };
  }

  const epData = await buildProductMasterEpData(productMaster, {
    searchTarget,
    ftpClient,
  });

  await ProductMaster.create({
    masterCode: productMaster.masterCode,
    masterCodeNo: productMaster.masterCodeNo,
    rawData: {
      ...productMaster,
      _searchTarget: searchTarget || null,
    },
    epData,
  });

  return { status: "created" };
}

/**
 * 전체 ProductMaster 스크래핑 및 DB 저장
 * - searchTargets를 순회하며 SearchProductMaster를 페이지 단위로 조회
 * - masterCode 중복을 제거하면서 DB에 저장
 * - created/updated/failed 집계를 반환
 */
async function scrapeAllProductMasters(searchTargets, startDate, endDate, options = {}) {
  const {
    onProgress,
    onItem,
    delayMs = 100,
  } = options;
  const results = { created: 0, updated: 0, failed: 0 };
  const seenCodes = new Set();

  resetImageUploadCache();

  let ftpClient = null;

  try {
    ftpClient = await createFtpClient();

    for (let i = 0; i < searchTargets.length; i++) {
      const searchTarget = searchTargets[i];
      let pageNo = 1;
      let totalPages = 1;

      do {
        try {
          const searchParams = searchTarget.type === "theme"
            ? {
                areaNo: 0,
                themeNo: searchTarget.themeNo,
              }
            : {
                areaNo: searchTarget.areaNo,
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

          for (const productMaster of masters) {
            if (seenCodes.has(productMaster.masterCode)) continue;
            seenCodes.add(productMaster.masterCode);

            try {
              const saveResult = await saveProductMaster(productMaster, searchTarget, { ftpClient });

              if (saveResult.status === "created") {
                results.created++;
              } else if (saveResult.status === "updated") {
                results.updated++;
              }

              if (onItem) {
                onItem({ productMaster, searchTarget, status: saveResult.status });
              }
            } catch (err) {
              results.failed++;
              console.error(
                "saveProductMaster failed:",
                {
                  masterCode: productMaster.masterCode,
                  searchTargetType: searchTarget.type,
                  searchTargetValue: searchTarget.areaNo || searchTarget.themeNo,
                  message: err.message,
                },
              );

              if (onItem) {
                onItem({ productMaster, searchTarget, status: "failed", error: err });
              }

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
            `${searchTarget.type} ${searchTarget.areaNo || searchTarget.themeNo} page ${pageNo} failed:`,
            err.message,
          );
        }

        pageNo++;
      } while (pageNo <= totalPages);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: searchTargets.length,
          target: searchTarget,
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
  scrapeAllProductMasters,
};
