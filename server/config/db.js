import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/**
 * Connect to MongoDB. Called once at startup.
 *
 * @returns {Promise<void>} Resolves when connected; throws on failure so the
 *   server can refuse to start without its database.
 */
export async function connectDB() {
  if (!env.mongodbUri) {
    throw new Error(
      "MONGODB_URI is not configured. Set it in server/.env before starting the server.",
    );
  }
  await mongoose.connect(env.mongodbUri);
  logger.info("MongoDB connected");
}

/** Disconnect gracefully (used by graceful shutdown). */
export async function disconnectDB() {
  await mongoose.disconnect();
}
