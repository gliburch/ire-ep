const { generateEpFile, generateEpFileFromProductMasters, generateEpFileFromDb, syncProductImages, syncProductMasterImages } = require("../services/epService");
const { uploadEpFile } = require("../services/ftpService");
const { getProductMasterSearchTargets } = require("../services/scraperService");
const { PRODUCT_MASTER_SCRAPE_MONTHS } = require("../config/env");
const { DAILY_BATCH_COUNT, runDailyScrapeBatch, runDailyFinalizeJob } = require("../services/schedulerService");
const ProductMaster = require("../models/ProductMaster");

async function epRoutes(fastify) {
  // EP 파일 조회 (TSV)
  fastify.get("/ep", async (request, reply) => {
    const tsvContent = await generateEpFile();

    reply.header("Content-Type", "text/plain; charset=utf-8");
    return tsvContent;
  });

  // EP 파일 FTP 업로드
  fastify.post("/ep/upload", async (request, reply) => {
    const tsvContent = await generateEpFile();
    const url = await uploadEpFile(tsvContent);

    return { success: true, url };
  });

  // ProductMaster 기반 EP 파일 생성
  fastify.get("/ep/masters", async (request, reply) => {
    const today = new Date();
    const endDateObj = new Date(today);
    endDateObj.setMonth(endDateObj.getMonth() + Number(PRODUCT_MASTER_SCRAPE_MONTHS));

    const startDate = today.toISOString().split("T")[0];
    const endDate = endDateObj.toISOString().split("T")[0];
    const targets = await getProductMasterSearchTargets();
    const result = await generateEpFileFromProductMasters(targets, startDate, endDate);

    reply.header("Content-Type", "text/plain; charset=utf-8");
    return result.content;
  });

  // ProductMaster 기반 EP 파일 FTP 업로드
  // ?uploadImages=true 로 이미지도 FTP에 업로드
  fastify.post("/ep/masters/upload", async (request, reply) => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const startDate = today.toISOString().split("T")[0];
    const endDate = nextYear.toISOString().split("T")[0];
    const uploadImages = request.query.uploadImages === "true";

    const targets = await getProductMasterSearchTargets();
    const result = await generateEpFileFromProductMasters(targets, startDate, endDate, {
      uploadImages,
    });
    const url = await uploadEpFile(result.content);

    return { success: true, url, count: result.count, imagesUploaded: uploadImages };
  });

  // DB 기반 EP 파일 조회 (ProductMaster 컬렉션)
  fastify.get("/ep/db", async (request, reply) => {
    const result = await generateEpFileFromDb();

    reply.header("Content-Type", "text/plain; charset=utf-8");
    return result.content;
  });

  // DB 기반 EP 파일 FTP 업로드
  // ?uploadImages=true 로 이미지도 FTP에 업로드
  fastify.post("/ep/db/upload", async (request, reply) => {
    const uploadImages = request.query.uploadImages === "true";

    const result = await generateEpFileFromDb({ uploadImages });
    const url = await uploadEpFile(result.content);

    return { success: true, url, count: result.count, imagesUploaded: uploadImages };
  });

  // DB 상태 확인
  fastify.get("/ep/db/stats", async (request, reply) => {
    const total = await ProductMaster.countDocuments();
    const withEpData = await ProductMaster.countDocuments({ epData: { $exists: true } });
    const recentlyUpdated = await ProductMaster.countDocuments({
      updated_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    return {
      total,
      withEpData,
      recentlyUpdated,
    };
  });

  // 상품 이미지 FTP 동기화
  // ?limit=10 으로 테스트 가능
  fastify.post("/ep/sync-images", async (request, reply) => {
    const limit = parseInt(request.query.limit) || 0;
    const result = await syncProductImages(limit);

    return { success: true, ...result };
  });

  // ProductMaster 이미지 FTP 동기화
  // ?limit=10 으로 테스트 가능
  fastify.post("/ep/db/sync-images", async (request, reply) => {
    const limit = parseInt(request.query.limit) || 0;
    const onlyPending = request.query.onlyPending !== "false";
    const result = await syncProductMasterImages({ limit, onlyPending });

    return { success: true, ...result };
  });

  // 데일리 배치 수동 실행
  fastify.post("/ep/daily-run", async (request, reply) => {
    const finalize = request.query.finalize === "true";
    const batchIndex = request.query.batchIndex !== undefined
      ? parseInt(request.query.batchIndex, 10)
      : null;
    const result = finalize
      ? await runDailyFinalizeJob({ logger: fastify.log })
      : await runDailyScrapeBatch(
          Number.isInteger(batchIndex) ? batchIndex : 0,
          { logger: fastify.log },
        );

    return {
      success: !result.skipped,
      batchCount: DAILY_BATCH_COUNT,
      ...result,
    };
  });
}

module.exports = epRoutes;
