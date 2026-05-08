const Product = require("../models/Product");
const ProductMaster = require("../models/ProductMaster");
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

  // 마지막 수집 이후 새 상품 가져오기
  fastify.post("/products/scrape-latest", async (request, reply) => {
    const maxRetry = parseInt(request.query.maxRetry, 10) || 10;

    // DB에서 최대 productNo 조회
    const lastProduct = await Product.findOne()
      .sort({ productNo: -1 })
      .select("productNo")
      .lean();

    let currentNo = lastProduct ? lastProduct.productNo + 1 : 1;
    let consecutiveFailures = 0;
    const results = { success: [], failed: [], skipped: [] };

    while (consecutiveFailures < maxRetry) {
      try {
        await scraperService.scrapeAndSave(currentNo.toString());
        results.success.push(currentNo);
        consecutiveFailures = 0;
      } catch (err) {
        if (err.response?.status === 404 || err.message.includes("Invalid")) {
          results.skipped.push(currentNo);
          consecutiveFailures++;
        } else {
          results.failed.push({ productNo: currentNo, error: err.message });
          consecutiveFailures++;
        }
      }
      currentNo++;
      await sleep(100);
    }

    return {
      success: true,
      summary: {
        startedFrom: lastProduct ? lastProduct.productNo + 1 : 1,
        successCount: results.success.length,
        failedCount: results.failed.length,
        skippedCount: results.skipped.length,
      },
      results,
    };
  });

  // 범위 스크래핑 (startNo ~ endNo 순차 수집)
  fastify.post("/products/scrape-range", async (request, reply) => {
    const { startNo, endNo } = request.query;

    if (!startNo || !endNo) {
      return reply.code(400).send({ error: "startNo and endNo are required" });
    }

    const start = parseInt(startNo, 10);
    const end = parseInt(endNo, 10);

    if (start > end) {
      return reply.code(400).send({ error: "startNo must be <= endNo" });
    }

    const results = { success: [], failed: [], skipped: [] };

    for (let currentNo = start; currentNo <= end; currentNo++) {
      try {
        await scraperService.scrapeAndSave(currentNo.toString());
        results.success.push(currentNo);
      } catch (err) {
        if (err.response?.status === 404 || err.message.includes("Invalid")) {
          results.skipped.push(currentNo);
        } else {
          results.failed.push({ productNo: currentNo, error: err.message });
        }
      }
      await sleep(100);
    }

    return {
      success: true,
      summary: {
        range: { startNo: start, endNo: end },
        successCount: results.success.length,
        failedCount: results.failed.length,
        skippedCount: results.skipped.length,
      },
      results,
    };
  });

  // 상품 목록 검색 (SearchProductMaster)
  fastify.post("/products/search", async (request, reply) => {
    const { areaNo, themeNo, searchFrom, searchTo, pageNo, pageSize, sortType } =
      request.body || {};

    if ((!areaNo && !themeNo) || !searchFrom || !searchTo) {
      return reply
        .code(400)
        .send({ error: "areaNo or themeNo, searchFrom, searchTo are required" });
    }

    const result = await scraperService.searchProductMaster({
      areaNo,
      themeNo,
      searchFrom,
      searchTo,
      pageNo,
      pageSize,
      sortType,
    });

    return result;
  });

  // 단일 productMaster 전체 상세 수집
  fastify.post("/products/scrape-master", async (request, reply) => {
    const { productMaster, startDate, endDate, delayMs } = request.body || {};

    if (!productMaster || !startDate || !endDate) {
      return reply
        .code(400)
        .send({ error: "productMaster, startDate, endDate are required" });
    }

    const result = await scraperService.fetchAllProductDetails(productMaster, {
      startDate,
      endDate,
      delayMs,
    });

    return {
      success: true,
      summary: {
        totalDates: result.totalDates,
        successCount: result.results.success.length,
        failedCount: result.results.failed.length,
      },
      results: result.results,
    };
  });

  // 전체 ProductMaster 스크래핑 및 DB 저장
  // 오늘부터 1년 후까지 GetGnb 기준 지역/테마 조회
  fastify.post("/product-masters/scrape", async (request, reply) => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const startDate = today.toISOString().split("T")[0];
    const endDate = nextYear.toISOString().split("T")[0];
    const targets = await scraperService.getProductMasterSearchTargets();

    const results = await scraperService.scrapeAllProductMasters(
      targets,
      startDate,
      endDate,
      {
        onProgress: ({ current, total, target, created, updated }) => {
          const label = target?.name || String(target?.areaNo || target?.themeNo || "Unknown");
          console.log(
            `${current}/${total} [${target?.type}] ${label} | created: ${created}, updated: ${updated}`,
          );
        },
      },
    );

    return {
      success: true,
      period: { startDate, endDate },
      targets: {
        areaCount: targets.areaTargets.length,
        themeCount: targets.themeTargets.length,
      },
      results,
    };
  });

  // ProductMaster 목록 조회
  fastify.get("/product-masters", async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [masters, total] = await Promise.all([
      ProductMaster.find()
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .select("masterCode masterCodeNo epData.title epData.price_pc updated_at")
        .lean(),
      ProductMaster.countDocuments(),
    ]);

    return {
      masters,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  });

  // ProductMaster 단건 조회
  fastify.get("/product-masters/:masterCode", async (request, reply) => {
    const { masterCode } = request.params;

    const master = await ProductMaster.findOne({ masterCode });
    if (!master) {
      return reply.code(404).send({ error: "ProductMaster not found" });
    }

    return master;
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
