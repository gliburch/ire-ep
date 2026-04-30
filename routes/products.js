const Product = require("../models/Product");
const scraperService = require("../services/scraperService");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function productsRoutes(fastify) {
  // 단일 상품 스크래핑
  fastify.post("/products/scrape", async (request, reply) => {
    const { productNo } = request.query;

    if (!productNo) {
      return reply.code(400).send({ error: "productNo is required" });
    }

    const product = await scraperService.scrapeAndSave(productNo);
    return { success: true, product };
  });

  // 여러 상품 일괄 스크래핑
  fastify.post("/products/scrape-bulk", async (request, reply) => {
    const { productNos } = request.body || {};

    if (!productNos || !Array.isArray(productNos) || productNos.length === 0) {
      return reply.code(400).send({ error: "productNos array is required" });
    }

    const results = { success: [], failed: [] };

    for (const productNo of productNos) {
      try {
        const product = await scraperService.scrapeAndSave(productNo);
        results.success.push({ productNo, id: product._id });
      } catch (err) {
        results.failed.push({ productNo, error: err.message });
      }
      await sleep(100);
    }

    return { success: true, results };
  });

  // 범위 스크래핑 (최신 상품부터 역순)
  fastify.post("/products/scrape-range", async (request, reply) => {
    const { startNo, count } = request.query;

    if (!startNo) {
      return reply.code(400).send({ error: "startNo is required" });
    }

    let currentNo = parseInt(startNo, 10);
    const targetCount = parseInt(count, 10) || 100;
    let successCount = 0;
    const results = { success: [], failed: [], skipped: [] };

    while (successCount < targetCount && currentNo > 0) {
      try {
        await scraperService.scrapeAndSave(currentNo.toString());
        results.success.push(currentNo);
        successCount++;
      } catch (err) {
        if (err.response?.status === 404 || err.message.includes("Invalid")) {
          results.skipped.push(currentNo);
        } else {
          results.failed.push({ productNo: currentNo, error: err.message });
        }
      }
      currentNo--;
      await sleep(100);
    }

    return {
      success: true,
      summary: {
        successCount: results.success.length,
        failedCount: results.failed.length,
        skippedCount: results.skipped.length,
      },
      results,
    };
  });

  // 상품 조회
  fastify.get('/products/:productNo', async (request, reply) => {
    const { productNo } = request.params;

    const product = await Product.findOne({ productNo: Number(productNo) });
    if (!product) {
      return reply.code(404).send({ error: 'Product not found' });
    }

    return product;
  });

  // 상품 목록 (페이지네이션)
  fastify.get('/products', async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find()
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(),
    ]);

    return {
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  });

  // 상품 삭제
  fastify.delete('/products/:productNo', async (request, reply) => {
    const { productNo } = request.params;

    const result = await Product.deleteOne({ productNo: Number(productNo) });
    if (result.deletedCount === 0) {
      return reply.code(404).send({ error: 'Product not found' });
    }

    return { success: true, message: 'Product deleted' };
  });
}

module.exports = productsRoutes;
