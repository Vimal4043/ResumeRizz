import { app } from "./app.js";
import { env, validateEnv } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { logger } from "./utils/logger.js";

async function start() {
  try {
    // Fail fast with a clear message if required configuration is missing.
    validateEnv();

    // The API requires MongoDB for accounts and analysis history — refuse to
    // start (with a clear error) if it is unreachable.
    await connectDB();

    // Bind to 0.0.0.0 so the render web service (and any reverse proxy) can
    // reach the API, not just a loopback-only localhost listener.
    const server = app.listen(env.port, "0.0.0.0", () => {
      logger.info(`AI Job Hunt API listening on port ${env.port}`);
      logger.info(`Environment: ${env.nodeEnv}`);
    });

    function shutdown(signal) {
      logger.info(`${signal} received — shutting down gracefully.`);
      server.close(async () => {
        await disconnectDB().catch(() => {});
        process.exit(0);
      });
      // Force-exit if open connections keep the event loop alive.
      setTimeout(() => process.exit(1), 10000).unref();
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

start();
