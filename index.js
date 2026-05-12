require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const mongoose = require('mongoose');
const routes = require('./routes');
const { validateEnv } = require('./config/env');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 3000;

// 전역 에러 핸들러
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  // Mongoose ValidationError
  if (error.name === 'ValidationError') {
    return reply.code(400).send({
      error: 'Validation Error',
      message: error.message,
    });
  }

  // MongoDB 중복 키 에러
  if (error.code === 11000) {
    return reply.code(409).send({
      error: 'Duplicate Key Error',
      message: 'Resource already exists',
    });
  }

  // Axios 에러
  if (error.isAxiosError) {
    return reply.code(error.response?.status || 502).send({
      error: 'External API Error',
      message: error.message,
      details: error.response?.data,
    });
  }

  // 기본 에러
  return reply.code(error.statusCode || 500).send({
    error: error.name || 'Internal Server Error',
    message: error.message,
  });
});

// 라우트 등록
fastify.register(routes);

fastify.get('/', async () => {
  return 'OK';
});

fastify.get('/health', async () => {
  const dbState = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return {
    status: 'ok',
    database: states[dbState] || 'unknown',
  };
});

async function start() {
  validateEnv();
  try {
    await connectDB(fastify.log);
  } catch (err) {
    fastify.log.error('MongoDB connection error:', err);
    process.exit(1);
  }

  try {
    await fastify.listen({ port: PORT });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
