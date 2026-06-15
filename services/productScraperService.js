const axios = require("axios");
const apiConfig = require("../config/apiConfig");
const Product = require("../models/Product");
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

const OVERSEAS_NAVER_CATEGORY = 50007257;

/**
 * 모두투어 GetProductDetailInfo API에서 단일 상품(출발일 단위) 상세 조회
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
 * 상품 상세(result)를 네이버 EP 형식으로 변환
 * - ftpClient가 있으면 이미지 URL을 FTP(Cafe24) URL로 치환
 */
async function buildProductEpData(result, options = {}) {
  const { ftpClient = null } = options;
  const data = result || {};
  const productMaster = data.productMaster || [];
  const representativeProduct = data.representativeProduct || [];
  const listAreaImages = data.listAreaImages || [];
  const badges = data.badges || {};

  // 대표 이미지: representativeProduct 첫 번째 또는 productMaster 이미지
  const mainImage =
    representativeProduct[0]?.url || productMaster[0]?.image || "";

  // 추가 이미지: representativeProduct(첫 번째 제외) + listAreaImages, 최대 10개
  const additionalImages = [
    ...representativeProduct
      .slice(1)
      .map((p) => p.url)
      .filter(Boolean),
    ...listAreaImages.map((p) => p.image).filter(Boolean),
  ].slice(0, 10);

  // 이미지 FTP 업로드 (신규 저장 시점에만 수행)
  const imageLink = mainImage
    ? (ftpClient ? await uploadImageToFtp(ftpClient, mainImage) : mainImage)
    : "";

  let addImageLink = "";
  if (additionalImages.length > 0) {
    const uploaded = [];
    for (const url of additionalImages) {
      uploaded.push(ftpClient ? await uploadImageToFtp(ftpClient, url) : url);
    }
    addImageLink = uploaded.filter(Boolean).join("|").slice(0, 2000);
  }

  // 속성: # 제거, 공백을 ^로 변환, 500자 제한
  const attribute = (data.groupBriefKeyword || "")
    .replace(/#/g, "")
    .replace(/\s+/g, "^")
    .slice(0, 500);

  // search_tag: keyword를 | 구분으로, 최대 10개
  const searchTag = (data.keyword || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
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

  // ID 생성: productCode_groupNumber_PGE_IRE
  const productCode = data.productCode || data.productCode2 || "";
  const rawId = `${productCode}_${groupNumber}_PGE_IRE`;

  return {
    id: sanitizeId(rawId),
    title: sanitizeTitle(
      data.departureDate
        ? `${data.productName || ""} ${data.departureDate} 출발`
        : data.productName || "",
    ),
    price_pc: data.benefitPriceInfo?.price || 1,
    benefit_price: data.benefitPriceInfo?.discountPrice || 1,
    normal_price: data.productPriceAdultTotalAmount || 1,
    link,
    mobile_link: mobileLink,
    image_link: imageLink,
    add_image_link: addImageLink,
    category_name1: "여가/생활편의",
    category_name2: "해외여행",
    category_name3: "해외패키지/기타",
    category_name4:
      `${data.koreanArrivalCityName || ""}출발 ${data.arrivalCityName || ""} ${data.groupClassification || ""}`.trim(),
    naver_category: OVERSEAS_NAVER_CATEGORY,
    brand: "모두투어",
    brand_certification: "Y",
    maker: "이레투어클럽",
    origin: "대한민국",
    search_tag: searchTag,
    shipping: 0,
    attribute,
    gender: "남녀공용",
    ...(badges.existsCoupon ? { coupon: "Y" } : {}),
  };
}

/**
 * 단일 상품 스크래핑 후 DB 저장 (upsert)
 * - ftpClient를 받으면 재사용, 없으면 내부에서 생성/정리
 */
async function scrapeProduct(productNo, options = {}) {
  const { ftpClient = null } = options;
  let localClient = null;
  let client = ftpClient;

  try {
    if (!client) {
      resetImageUploadCache();
      try {
        client = localClient = await createFtpClient();
      } catch (err) {
        console.warn(
          `[WARN] FTP 연결 실패, 이미지 업로드 없이 진행합니다 (productNo=${productNo}): ${err.message}`,
        );
        client = null;
      }
    }

    const apiResponse = await fetchProductFromApi(productNo);
    const rawData = apiResponse.result || {};
    const epData = await buildProductEpData(rawData, { ftpClient: client });

    const existing = await Product.exists({ productNo: Number(productNo) });
    const product = await Product.findOneAndUpdate(
      { productNo: Number(productNo) },
      {
        productNo: Number(productNo),
        epData,
        departureDate: rawData.departureDate
          ? new Date(rawData.departureDate)
          : null,
        arrivalDate: rawData.arrivalDate ? new Date(rawData.arrivalDate) : null,
      },
      { upsert: true, returnDocument: "after" },
    );

    return { product, status: existing ? "updated" : "created" };
  } finally {
    if (localClient) {
      try {
        localClient.close();
      } catch {}
    }
  }
}

/**
 * 여러 상품(productNo 목록)을 하나의 FTP 연결로 순차 스크래핑
 * - 404/Invalid 응답은 skipped로 분류
 * - created/updated/skipped/failed 집계를 반환
 */
async function scrapeProducts(productNos, options = {}) {
  const {
    onProgress,
    onItem,
    delayMs = 100,
  } = options;
  const results = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const total = productNos.length;

  resetImageUploadCache();

  let ftpClient = null;

  try {
    try {
      ftpClient = await createFtpClient();
    } catch (err) {
      console.warn(
        `[WARN] FTP 연결 실패, 이미지 업로드 없이 진행합니다: ${err.message}`,
      );
      ftpClient = null;
    }

    for (let i = 0; i < total; i++) {
      const productNo = productNos[i];
      const current = i + 1;

      try {
        const { product, status } = await scrapeProduct(productNo, { ftpClient });

        if (status === "created") {
          results.created++;
        } else {
          results.updated++;
        }

        if (onItem) {
          onItem({ current, total, productNo, status, product });
        }
      } catch (err) {
        const isInvalid =
          err.response?.status === 404 || err.message?.includes("Invalid");

        if (isInvalid) {
          results.skipped++;
          if (onItem) onItem({ current, total, productNo, status: "skipped" });
        } else {
          results.failed++;
          if (onItem) onItem({ current, total, productNo, status: "failed", error: err });
        }

        // FTP 연결 끊김 시 재연결
        if (
          ftpClient &&
          (err.message?.includes("Timeout") || err.message?.includes("closed"))
        ) {
          try {
            ftpClient.close();
          } catch {}
          try {
            ftpClient = await createFtpClient();
          } catch {
            ftpClient = null;
          }
        }
      }

      if (onProgress) {
        onProgress({ current: i + 1, total, productNo, ...results });
      }

      await sleep(delayMs);
    }
  } finally {
    if (ftpClient) {
      try {
        ftpClient.close();
      } catch {}
    }
  }

  return results;
}

module.exports = {
  fetchProductFromApi,
  buildProductEpData,
  scrapeProduct,
  scrapeProducts,
};
