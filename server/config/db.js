const mongoose = require('mongoose');

let ensurePromise = null;

/**
 * Ensure the default mongoose connection is usable, connecting (or
 * reconnecting) on demand.
 *
 * Why this exists: server.js only opens the connection when run directly
 * (`require.main === module`) — module-imported runs (Vercel serverless,
 * `vercel dev`) never connect, and a connection that dies mid-flight (e.g.
 * sockets killed by machine sleep against Atlas) does not reliably self-heal
 * before the next operation.
 */
function ensureDbConnection() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }
  if (!process.env.MONGO_URI) {
    return Promise.reject(new Error('MONGO_URI is not configured'));
  }
  if (!ensurePromise) {
    const timeoutMs = Number.parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS, 10) || 10000;
    ensurePromise = mongoose
      .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: timeoutMs,
      })
      .then(() => {
        console.log('MongoDB connected');
      })
      .finally(() => {
        ensurePromise = null;
      });
  }
  return ensurePromise;
}

const connectDB = async () => {
  try {
    await ensureDbConnection();
  } catch (err) {
    console.error('MongoDB connection error:', err && err.message);
    if (require.main === module) {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
module.exports.ensureDbConnection = ensureDbConnection;
