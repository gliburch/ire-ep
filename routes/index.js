const productsRoutes = require('./products');

async function routes(fastify) {
  fastify.register(productsRoutes);
}

module.exports = routes;
