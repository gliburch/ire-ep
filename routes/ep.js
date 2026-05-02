const { generateEpFile, syncProductImages } = require("../services/epService");
const { uploadEpFile } = require("../services/ftpService");

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

  // 상품 이미지 FTP 동기화
  // ?limit=10 으로 테스트 가능
  fastify.post("/ep/sync-images", async (request, reply) => {
    const limit = parseInt(request.query.limit) || 0;
    const result = await syncProductImages(limit);

    return { success: true, ...result };
  });
}

module.exports = epRoutes;
