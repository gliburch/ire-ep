const Product = require("../models/Product");
const ProductMaster = require("../models/ProductMaster");
const {
  createClient,
  uploadImageWithClient,
  clearCache,
  FTP_BASE_URL,
} = require("./ftpService");
const {
  searchProductMaster,
  transformProductMasterToEpData,
} = require("./scraperService");

/**
 * FTP 클라이언트 래퍼 (자동 재연결)
 */
class FtpClientWrapper {
  constructor() {
    this.client = null;
  }

  async getClient() {
    if (!this.client || this.client.closed) {
      this.client = await createClient();
    }
    return this.client;
  }

  async uploadImage(imageUrl) {
    if (!imageUrl) return "";
    try {
      const client = await this.getClient();
      return await uploadImageWithClient(client, imageUrl);
    } catch (err) {
      // 연결 끊김 시 재연결 시도
      if (err.message.includes("closed") || err.message.includes("Timeout")) {
        try {
          this.client = await createClient();
          return await uploadImageWithClient(this.client, imageUrl);
        } catch (retryErr) {
          console.error("Image upload failed (retry):", imageUrl, retryErr.message);
          return imageUrl;
        }
      }
      console.error("Image upload failed:", imageUrl, err.message);
      return imageUrl;
    }
  }

  close() {
    if (this.client) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
    }
  }
}

/**
 * TSV용 제어문자 제거
 * - 탭, 엔터, 기타 제어문자를 공백으로 변환
 */
function sanitizeForTsv(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/[\t\n\r\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 네이버 EP 헤더 필드 (순서 중요)
 */
const EP_HEADERS = [
  "id",
  "title",
  "price_pc",
  "benefit_price",
  "normal_price",
  "link",
  "mobile_link",
  "image_link",
  "add_image_link",
  "category_name1",
  "category_name2",
  "category_name3",
  "category_name4",
  "naver_category",
  "brand",
  "brand_certification",
  "maker",
  "origin",
  "search_tag",
  "shipping",
  "attribute",
  "gender",
];

/**
 * 상품 데이터를 TSV 행으로 변환
 */
function productToTsvRow(epData) {
  return EP_HEADERS.map((header) => sanitizeForTsv(epData[header])).join("\t");
}

/**
 * EP 파일 생성
 * - departureDate가 오늘 이후인 상품만 조회
 * - TSV 형식으로 변환하여 반환
 */
async function generateEpFile() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const products = await Product.find({
    departureDate: { $gte: today },
  }).lean();

  const headerRow = EP_HEADERS.join("\t");
  const dataRows = products
    .filter((p) => p.epData)
    .map((p) => productToTsvRow(p.epData));

  return [headerRow, ...dataRows].join("\n");
}

/**
 * 상품 이미지를 FTP에 동기화
 * - 모두투어 이미지를 다운로드하여 FTP에 업로드
 * - epData의 이미지 URL을 FTP URL로 변경
 * @param {number} limit - 처리할 상품 수 제한 (0 = 전체)
 */
async function syncProductImages(limit = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let query = Product.find({
    departureDate: { $gte: today },
    epData: { $exists: true },
  });

  if (limit > 0) {
    query = query.limit(limit);
  }

  const products = await query;

  clearCache();

  let synced = 0;
  let failed = 0;
  let client = null;

  try {
    client = await createClient();

    for (const product of products) {
      try {
        const epData = product.epData;
        let updated = false;

        // 메인 이미지 동기화
        if (epData.image_link && !epData.image_link.includes("cafe24.com")) {
          const newUrl = await uploadImageWithClient(client, epData.image_link);
          if (newUrl) {
            epData.image_link = newUrl;
            updated = true;
          }
        }

        // 추가 이미지 동기화
        if (epData.add_image_link && !epData.add_image_link.includes("cafe24.com")) {
          const urls = epData.add_image_link.split("|").filter(Boolean);
          const newUrls = [];

          for (const url of urls) {
            const newUrl = await uploadImageWithClient(client, url);
            newUrls.push(newUrl || url);
          }

          epData.add_image_link = newUrls.join("|");
          updated = true;
        }

        if (updated) {
          product.epData = epData;
          product.markModified("epData");
          await product.save();
          synced++;
        }
      } catch (err) {
        console.error(`Failed to sync product ${product.productNo}:`, err.message);
        failed++;

        // 연결 끊김 시 재연결
        if (err.message.includes("Timeout") || err.message.includes("closed")) {
          try {
            client.close();
          } catch {}
          client = await createClient();
        }
      }
    }
  } finally {
    if (client) client.close();
  }

  return { total: products.length, synced, failed };
}

/**
 * ProductMaster API 기반 EP 파일 생성
 * @param {number[]} areaNos - 조회할 지역 번호 배열
 * @param {string} startDate - 검색 시작일 (YYYY-MM-DD)
 * @param {string} endDate - 검색 종료일 (YYYY-MM-DD)
 * @param {object} options - 옵션
 * @param {boolean} options.uploadImages - 이미지를 FTP에 업로드할지 여부
 * @param {function} options.onProgress - 진행 상황 콜백
 */
async function generateEpFileFromProductMasters(areaNos, startDate, endDate, options = {}) {
  const { uploadImages = false, onProgress } = options;
  const allEpData = [];
  const seenIds = new Set();

  // 이미지 업로드용 FTP 클라이언트 래퍼
  let ftpWrapper = null;
  if (uploadImages) {
    clearCache();
    ftpWrapper = new FtpClientWrapper();
  }

  try {
    for (let i = 0; i < areaNos.length; i++) {
      const areaNo = areaNos[i];
      let pageNo = 1;
      let totalPages = 1;

      do {
        const result = await searchProductMaster({
          areaNo,
          searchFrom: startDate,
          searchTo: endDate,
          pageNo,
          pageSize: 100,
        });

        totalPages = result.result.totalPages || 1;
        const masters = result.result.productMaster || [];

        for (const master of masters) {
          try {
            const epData = transformProductMasterToEpData(master);

            // 중복 제거 (같은 masterCode가 여러 지역에 나올 수 있음)
            if (!seenIds.has(epData.id)) {
              seenIds.add(epData.id);

              // 이미지 FTP 업로드
              if (uploadImages && ftpWrapper && epData.image_link) {
                epData.image_link = await ftpWrapper.uploadImage(epData.image_link);
              }

              allEpData.push(epData);
            }
          } catch (err) {
            console.error(`Failed to transform master ${master.masterCode}:`, err.message);
          }
        }

        pageNo++;
      } while (pageNo <= totalPages);

      // 진행 상황 콜백
      if (onProgress) {
        onProgress({ current: i + 1, total: areaNos.length, count: allEpData.length });
      }
    }
  } finally {
    if (ftpWrapper) {
      ftpWrapper.close();
    }
  }

  const headerRow = EP_HEADERS.join("\t");
  const dataRows = allEpData.map((ep) => productToTsvRow(ep));

  return {
    content: [headerRow, ...dataRows].join("\n"),
    count: allEpData.length,
  };
}

/**
 * DB에 저장된 ProductMaster 기반 EP 파일 생성
 * - 최근 24시간 내 업데이트된 ProductMaster만 포함
 * @param {object} options - 옵션
 * @param {boolean} options.uploadImages - 이미지를 FTP에 업로드할지 여부
 */
async function generateEpFileFromDb(options = {}) {
  const { uploadImages = false } = options;

  // 24시간 전
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const masters = await ProductMaster.find({
    updated_at: { $gte: since },
  }).lean();

  let ftpWrapper = null;
  if (uploadImages) {
    clearCache();
    ftpWrapper = new FtpClientWrapper();
  }

  const epDataList = [];

  try {
    for (const master of masters) {
      if (!master.epData) continue;

      const epData = { ...master.epData };

      // 이미지 FTP 업로드
      if (uploadImages && ftpWrapper && epData.image_link) {
        epData.image_link = await ftpWrapper.uploadImage(epData.image_link);
      }

      epDataList.push(epData);
    }
  } finally {
    if (ftpWrapper) {
      ftpWrapper.close();
    }
  }

  const headerRow = EP_HEADERS.join("\t");
  const dataRows = epDataList.map((ep) => productToTsvRow(ep));

  return {
    content: [headerRow, ...dataRows].join("\n"),
    count: epDataList.length,
  };
}

module.exports = {
  sanitizeForTsv,
  EP_HEADERS,
  generateEpFile,
  generateEpFileFromProductMasters,
  generateEpFileFromDb,
  syncProductImages,
};
