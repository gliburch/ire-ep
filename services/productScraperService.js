const axios = require("axios");
const apiConfig = require("../config/apiConfig");
const Product = require("../models/Product");
const {
  connectFtpWithRetry,
  checkFtpWritable,
  isFtpConnectionError,
  isFtpQuotaError,
  uploadImageToFtp,
  resetImageUploadCache,
} = require("./ftpService");
const {
  sanitizeId,
  sanitizeTitle,
  sleep,
} = require("./scraperUtils");

const OVERSEAS_NAVER_CATEGORY = 50007257;

// 연속으로 이만큼 FTP 관련 실패가 나면 원인이 일시적 끊김이 아니라고 보고 중단한다.
const MAX_CONSECUTIVE_FTP_FAILURES = 5;

// 판매 종료/취소 상품 판정에 쓰는 플래그. 하나라도 "Y"면 수집 대상이 아니다.
const SOLDOUT_FLAGS = ["salesEnd", "salesEndTravelPlanner", "cancel"];

/**
 * 판매 종료/취소로 "Y"가 선 플래그 목록을 돌려준다.
 * - 빈 배열이면 판매 중인 상품
 */
function getSoldoutFlags(result) {
  const data = result || {};
  return SOLDOUT_FLAGS.filter((flag) => data[flag] === "Y");
}

/**
 * 출발일이 오늘보다 이전인지 판단한다.
 * - 오늘 출발은 아직 유효하므로 자정 기준으로 비교한다
 * - departureDate가 없거나 형식이 깨진 값은 걸러내지 않는다(판단 불가)
 */
function isDeparted(result) {
  const raw = (result || {}).departureDate;
  if (!raw) return false;

  const departureDate = new Date(raw);
  if (Number.isNaN(departureDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return departureDate < today;
}

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
    // 이미지가 FTP에 올라가지 않은 채 원본 URL로 저장되면 EP가 오염되므로,
    // FTP를 확보하지 못하면 수집을 진행하지 않는다.
    if (!client) {
      resetImageUploadCache();
      client = localClient = await connectFtpWithRetry(` (productNo=${productNo})`);
    }

    const apiResponse = await fetchProductFromApi(productNo);
    const rawData = apiResponse.result || {};

    // 판매 종료/취소 상품은 EP 대상이 아니므로 이미지 업로드 전에 걸러낸다.
    const soldoutFlags = getSoldoutFlags(rawData);
    if (soldoutFlags.length > 0) {
      return { product: null, status: "soldout", soldoutFlags };
    }

    // 이미 출발한 상품도 EP 대상이 아니다. 판정 시점은 soldout과 같다.
    if (isDeparted(rawData)) {
      return { product: null, status: "departed", departureDate: rawData.departureDate };
    }

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
 * 배치 중단 에러를 만든다.
 * - 어디까지 진행했는지 호출측이 알 수 있도록 집계와 중단 지점을 함께 싣는다
 */
function buildAbortError(message, { results, productNo, current }) {
  const error = new Error(message);
  error.aborted = true;
  error.results = results;
  error.lastProductNo = productNo;
  error.lastIndex = current;
  return error;
}

/**
 * 여러 상품(productNo 목록)을 하나의 FTP 연결로 순차 스크래핑
 * - 404/Invalid 응답은 skipped, 판매 종료/취소는 soldout, 출발일 경과는 departed로 분류
 * - created/updated/skipped/failed 집계를 반환
 */
async function scrapeProducts(productNos, options = {}) {
  const {
    onProgress,
    onItem,
    delayMs = 100,
  } = options;
  const results = { created: 0, updated: 0, soldout: 0, departed: 0, skipped: 0, failed: 0 };
  const total = productNos.length;

  resetImageUploadCache();

  // 배치 시작 전에 FTP를 확보하지 못하면 아예 시작하지 않는다.
  // (연결 없이 진행하면 상품마다 재연결을 시도해 차단을 더 키우고,
  //  이미지가 원본 URL로 저장돼 EP 데이터가 오염된다)
  let ftpClient = await connectFtpWithRetry();
  let consecutiveFtpFailures = 0;

  try {
    for (let i = 0; i < total; i++) {
      const productNo = productNos[i];
      const current = i + 1;

      try {
        const { product, status, soldoutFlags, departureDate } = await scrapeProduct(productNo, { ftpClient });

        // departed/soldout은 이미지 업로드를 거치지 않으므로 FTP가 정상이라는 근거가 못 된다.
        // 실제로 업로드를 통과한 경우에만 연속 실패를 초기화한다.
        if (status === "created" || status === "updated") {
          consecutiveFtpFailures = 0;
        }

        if (status === "created") {
          results.created++;
        } else if (status === "soldout") {
          results.soldout++;
        } else if (status === "departed") {
          results.departed++;
        } else {
          results.updated++;
        }

        if (onItem) {
          onItem({ current, total, productNo, status, product, soldoutFlags, departureDate });
        }
      } catch (err) {
        const isInvalid =
          err.response?.status === 404 || err.message?.includes("Invalid");

        if (isInvalid) {
          results.skipped++;
          if (onItem) onItem({ current, total, productNo, status: "skipped", error: err });
        } else {
          results.failed++;
          if (onItem) onItem({ current, total, productNo, status: "failed", error: err });
        }

        // 용량 초과는 재연결해도 절대 풀리지 않는다. 남은 상품을 전부 실패로
        // 소진하지 않도록 즉시 중단한다.
        if (isFtpQuotaError(err)) {
          throw buildAbortError(
            `FTP 저장 용량이 부족합니다 (productNo=${productNo}): ${err.message}`,
            { results, productNo, current },
          );
        }

        if (isFtpConnectionError(err)) {
          consecutiveFtpFailures++;

          // 재연결에 성공하는데도 실패가 이어지면 연결 문제가 아니다(용량 부족 등).
          // 같은 실패를 범위 끝까지 반복하지 않도록 중단한다.
          if (consecutiveFtpFailures >= MAX_CONSECUTIVE_FTP_FAILURES) {
            throw buildAbortError(
              `FTP 업로드가 ${consecutiveFtpFailures}회 연속 실패했습니다 (productNo=${productNo}): ${err.message}`,
              { results, productNo, current },
            );
          }

          try {
            ftpClient.close();
          } catch {}

          ftpClient = await connectFtpWithRetry(
            ` (productNo=${productNo} 처리 중)`,
          );

          // 연결은 되는데 업로드만 실패하는 경우(용량 초과 등)를 여기서 가려낸다.
          const { writable, reason } = await checkFtpWritable(ftpClient);
          if (!writable) {
            throw buildAbortError(
              `FTP에 파일을 쓸 수 없습니다 (productNo=${productNo}): ${reason}`,
              { results, productNo, current },
            );
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
  getSoldoutFlags,
  isDeparted,
  fetchProductFromApi,
  buildProductEpData,
  scrapeProduct,
  scrapeProducts,
};
