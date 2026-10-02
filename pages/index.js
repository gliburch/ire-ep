const path = require("path");
const ejs = require("ejs");
const {
  getSummary,
  getProductFeed,
  getChangeLogFeed,
  DEFAULT_PAGE_SIZE,
} = require("../services/dashboardService");

/**
 * 수집 현황 대시보드 페이지 플러그인.
 * - 화면과 화면 제어 스크립트는 EJS 템플릿 하나에 담고, 목록 데이터만 JSON API로 받아 갱신한다
 */
async function pagesPlugin(fastify) {
  await fastify.register(require("@fastify/view"), {
    engine: { ejs },
    root: path.join(__dirname, "views"),
    viewExt: "ejs",
  });

  fastify.get("/dashboard", async (request, reply) => {
    const summary = await getSummary();
    return reply.view("dashboard", { summary });
  });

  fastify.get("/http-api/dashboard/summary", async () => {
    return getSummary();
  });

  fastify.get("/http-api/dashboard/feed", async (request) => {
    const { sort, date, page, pageSize } = request.query;

    return getProductFeed({
      sort: sort === "updated" ? "updated" : "created",
      date,
      page: page,
      pageSize: pageSize || DEFAULT_PAGE_SIZE,
    });
  });

  fastify.get("/http-api/dashboard/changes", async (request) => {
    const { date, page, pageSize } = request.query;

    return getChangeLogFeed({
      date,
      page,
      pageSize: pageSize || DEFAULT_PAGE_SIZE,
    });
  });
}

module.exports = pagesPlugin;
