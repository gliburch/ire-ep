const mongoose = require("mongoose");

let connectPromise = null;

async function connectDB(logger = console) {
  const readyState = mongoose.connection.readyState;

  if (readyState === 1) {
    return mongoose.connection;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB,
  });

  try {
    await connectPromise;
    logger.info?.(`MongoDB connected to database: ${process.env.MONGODB_DB}`);
    return mongoose.connection;
  } catch (err) {
    connectPromise = null;
    throw err;
  }
}

module.exports = {
  connectDB,
};
