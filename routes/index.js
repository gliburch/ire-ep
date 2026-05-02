const productsRoutes = require('./products');
const epRoutes = require('./ep');

async function routes(fastify) {
  fastify.register(productsRoutes);
  fastify.register(epRoutes);
}

module.exports = routes;
