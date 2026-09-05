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
  aiMaxRetries: Math.max(0, Number(process.env.AI_MAX_RETRIES) || 2),
  // Base delay for exponential backoff between retry attempts (ms).
  aiRetryBaseDelayMs: Math.max(100, Number(process.env.AI_RETRY_BASE_DELAY_MS) || 1_000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongodbUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  // Token lifetime. 7 days is a reasonable default for a web app; tokens are
  // held in memory/localStorage client-side, never in URLs.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // Application-level analysis quota temporarily disabled.
  // Re-enable after monitoring real usage and establishing production limits.
  // Restore these fields together with the limiters in routes/analysisRoutes.js:
  //   guestAnalysisLimit: Number(process.env.GUEST_ANALYSIS_LIMIT) || 5,
  //   guestAnalysisWindowMs:
  //     (Number(process.env.GUEST_ANALYSIS_WINDOW_MINUTES) || 15) * 60 * 1000,
  //   authAnalysisLimit: Number(process.env.AUTH_ANALYSIS_LIMIT) || 30,
  //   authAnalysisWindowMs:
  //     (Number(process.env.AUTH_ANALYSIS_WINDOW_HOURS) || 24) * 60 * 60 * 1000,
  // Hard ceiling for one Gemini HTTP attempt. Past this, the attempt is aborted
  // and (for transient errors) retried within the configured retry budget
  // instead of hanging. Supports the newer AI_REQUEST_TIMEOUT_MS name and keeps
  // the legacy AI_TIMEOUT_MS as a compatible fallback.
  aiRequestTimeoutMs:
    Number(process.env.AI_REQUEST_TIMEOUT_MS) ||
    Number(process.env.AI_TIMEOUT_MS) ||
    60_000,
  // Overall wall-clock budget (ms) for the ENTIRE generateContent call across
  // all attempts and the fallback model. Prevents a worst case of
  // (1 + AI_MAX_RETRIES) × models × AI_REQUEST_TIMEOUT_MS of user waiting
  // when the provider hangs. Defaults to two per-attempt timeouts: at least
  // two full attempts always get a chance, but a hanging provider can never
  // hold a user request for more than ~2× the per-attempt timeout.
  aiTotalBudgetMs:
    Number(process.env.AI_TOTAL_BUDGET_MS) ||
    (Number(process.env.AI_REQUEST_TIMEOUT_MS) ||
      Number(process.env.AI_TIMEOUT_MS) ||
      60_000) *
      2,
  // Maximum accepted job-description length (defends the AI prompt + DB).
  maxJobDescriptionLength: Number(process.env.MAX_JOB_DESCRIPTION_LENGTH) || 20_000,
  // Maximum accepted resume upload size (multer + frontend stay in sync).
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB) * 1024 * 1024 || 5 * 1024 * 1024,
  // ---- Analysis quota & cooldown (application-level, re-enabled) ----
  // Guests are limited per IP (in-memory), authenticated users per account
  // (persisted in MongoDB via the Analysis collection).
  guestDailyAnalysisLimit: Number(process.env.GUEST_DAILY_ANALYSIS_LIMIT) || 5,
  authDailyAnalysisLimit: Number(process.env.AUTH_DAILY_ANALYSIS_LIMIT) || 20,
  // Minimum time between two analyses (any user). Prevents rapid-fire usage
  // and accidental double-runs; applies to SUCCESSFUL analyses only.
  analysisCooldownMs:
    (Number(process.env.ANALYSIS_COOLDOWN_MINUTES) || 10) * 60 * 1000,
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
