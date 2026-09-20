const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

/**
 * Ensure the default mongoose connection is usable, connecting (or
 * reconnecting) on demand.
 *
 * Why this exists: server.js only opens the connection when run directly
 * (`require.main === module`) — module-imported runs (Vercel serverless,
 * `vercel dev`) never connect, and a connection that dies mid-flight (e.g.
 * sockets killed by machine sleep against Atlas) does not reliably self-heal
 * before the next operation. Routes that REQUIRE the database (predictor
 * persistence) call this before their first DB op instead of assuming a
 * healthy connection.
 *
 * Behaviour:
 *  - readyState 1 (connected) → immediate no-op
 *  - otherwise → mongoose.connect(MONGO_URI) with the cached in-flight
 *    promise shared by concurrent callers; the cache is cleared once settled
 *    so a later drop triggers a fresh reconnect (self-healing)
 *  - timeouts via MONGO_CONNECT_TIMEOUT_MS (default 10s)
 * Rejections propagate to the caller, which decides how to respond.
 */
let ensurePromise = null;

function ensureDbConnection() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }
  if (!ensurePromise) {
    const timeoutMs = Number.parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS, 10) || 10000;
    ensurePromise = mongoose
      .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: timeoutMs,
      })
      .finally(() => {
        ensurePromise = null;
      });
  }
  return ensurePromise;
}

module.exports = connectDB;
module.exports.ensureDbConnection = ensureDbConnection;
