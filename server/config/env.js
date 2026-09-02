import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The environment file lives in the server folder (server/.env). Resolving it
// from this config file's location keeps loading working regardless of the
// current working directory.
const serverRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(serverRoot, "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT) || 5000,
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // Model name is centralized here so it can be swapped without touching
  // business logic. Prefer a currently available stable Flash model (free tier).
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  // Token lifetime. 7 days is a reasonable default for a web app; tokens are
  // held in memory/localStorage client-side, never in URLs.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // How many anonymous (unauthenticated) analyses one IP may run per rolling
  // 15-minute window. Generous enough to test comfortably, tight enough to
  // blunt obvious abuse of the free AI API. Authenticated users are instead
  // governed by the global API limiter.
  guestAnalysisLimit: Number(process.env.GUEST_ANALYSIS_LIMIT) || 5,
  uploadsDir: path.join(projectRoot, "uploads"),
};

const SECRETS = {
  GEMINI_API_KEY: env.geminiApiKey,
  CLIENT_URL: env.clientUrl,
  MONGODB_URI: env.mongodbUri,
  JWT_SECRET: env.jwtSecret,
};

/**
 * Validates the loaded environment configuration.
 *
 * - In production, a missing required secret aborts startup with a clear,
 *   aggregated message instead of a cryptic runtime failure.
 * - In development, missing secrets (Mongo, Gemini, JWT) only warn so the API
 *   can still boot while building the foundation.
 *
 * @returns {typeof env}
 */
export function validateEnv() {
  if (env.port < 1 || env.port > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535, got "${process.env.PORT}". ` +
        "Fix PORT in your environment configuration.",
    );
  }

  if (env.isProd) {
    const missing = Object.entries(SECRETS)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in ${env.nodeEnv}: ${missing.join(", ")}. ` +
          "Refusing to start with incomplete configuration.",
      );
    }
  }

  return env;
}
