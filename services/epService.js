const Product = require("../models/Product");
const {
  createClient,
  uploadImageWithClient,
  clearCache,
  FTP_BASE_URL,
} = require("./ftpService");

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

module.exports = {
  sanitizeForTsv,
  EP_HEADERS,
  generateEpFile,
  syncProductImages,
};
