const { generateEpFile } = require("../services/epService");

async function epRoutes(fastify) {
  fastify.get("/ep", async (request, reply) => {
    const tsvContent = await generateEpFile();

    reply.header("Content-Type", "text/plain; charset=utf-8");
    return tsvContent;
  });
}

module.exports = epRoutes;
