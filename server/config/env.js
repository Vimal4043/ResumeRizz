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
  // Model names are centralized here so they can be swapped without touching
  // business logic. Prefer a currently available stable Flash model (free tier).
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  // Optional fallback model used only when the primary model is transiently
  // unavailable (e.g. 503). Empty string disables the fallback.
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || "",
  // AI reliability settings. Retries apply ONLY to transient failures
  // (503/unavailable, timeouts, empty responses) — never to auth errors,
  // malformed requests, or daily quota exhaustion.
  // HARDCODED (not env-configurable by design):
  //   - AI_MAX_RETRIES = 2 (extra attempts for the primary model)
  aiMaxRetries: 2,
  // Base delay (ms) for exponential backoff between retry attempts (~1s, ~2s).
  // HARDCODED (not env-configurable by design): AI_RETRY_BASE_DELAY_MS = 1000.
  aiRetryBaseDelayMs: 1_000,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  // Token lifetime. 7 days is a reasonable default for a web app; tokens are
  // held in memory/localStorage client-side, never in URLs.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // ---- Analysis quota & cooldown (application-level) ----
  // HARDCODED (not env-configurable by design):
  //   - Guest: 1 successful analysis per guest session per UTC day
  //   - Authenticated user: 2 successful analyses per account per UTC day
  guestDailyAnalysisLimit: 1,
  authDailyAnalysisLimit: 2,
  // Minimum time between two analyses (any user). Prevents rapid-fire usage
  // and accidental double-runs; applies to SUCCESSFUL analyses only.
  analysisCooldownMs:
    (Number(process.env.ANALYSIS_COOLDOWN_MINUTES) || 10) * 60 * 1000,
  // Hard ceiling for one Gemini HTTP attempt (120s). Past this, the attempt is
  // aborted and (for transient errors) retried within the retry budget instead
  // of hanging.
  // HARDCODED (not env-configurable by design): AI_REQUEST_TIMEOUT_MS = 120000.
  aiRequestTimeoutMs: 120_000,
  // Overall wall-clock budget (ms) for the ENTIRE generateContent call across
  // all attempts and the fallback model. Prevents a hanging provider from
  // holding a user request indefinitely.
  // HARDCODED (not env-configurable by design): 240000 (2x the per-attempt timeout).
  aiTotalBudgetMs: 240_000,
  // HARDCODED (not env-configurable by design):
  //   - Job descriptions longer than 20,000 characters are rejected.
  maxJobDescriptionLength: 20_000,
  //   - Resume uploads larger than 5 MB are rejected (multer + frontend stay
  //     in sync; the client hardcodes the same 5 MB limit).
  maxUploadBytes: 5 * 1024 * 1024,
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
