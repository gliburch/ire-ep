const { generateEpFile, generateEpFileFromProductMasters, syncProductImages } = require("../services/epService");
const { uploadEpFile } = require("../services/ftpService");
const { AREA_UNION } = require("../config/areaKeywords");

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
  // 오늘부터 1년 후까지 모든 지역의 ProductMaster를 조회
  fastify.get("/ep/masters", async (request, reply) => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const startDate = today.toISOString().split("T")[0];
    const endDate = nextYear.toISOString().split("T")[0];

    // 모든 유니온 지역 조회
    const areaNos = Object.values(AREA_UNION);

    const result = await generateEpFileFromProductMasters(areaNos, startDate, endDate);

    reply.header("Content-Type", "text/plain; charset=utf-8");
    return result.content;
  });

  // ProductMaster 기반 EP 파일 FTP 업로드
  fastify.post("/ep/masters/upload", async (request, reply) => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const startDate = today.toISOString().split("T")[0];
    const endDate = nextYear.toISOString().split("T")[0];

    const areaNos = Object.values(AREA_UNION);

    const result = await generateEpFileFromProductMasters(areaNos, startDate, endDate);
    const url = await uploadEpFile(result.content);

    return { success: true, url, count: result.count };
  });

  // 상품 이미지 FTP 동기화
  // ?limit=10 으로 테스트 가능
  fastify.post("/ep/sync-images", async (request, reply) => {
    const limit = parseInt(request.query.limit) || 0;
    const result = await syncProductImages(limit);

    return { success: true, ...result };
  });
}

module.exports = epRoutes;
