import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { AppError } from "../../utils/errors.js";

/**
 * Thin, server-only wrapper around the official Google Gemini SDK with a
 * built-in reliability layer:
 *
 *  - Error classification (`classifyGeminiError`) so only TRANSIENT failures
 *    (503/unavailable, timeouts, empty responses, temporary rate limits) are
 *    retried — never auth errors, malformed requests, or quota exhaustion.
 *  - Exponential backoff with jitter, bounded by AI_MAX_RETRIES.
 *  - An optional fallback model (GEMINI_FALLBACK_MODEL) with an availability
 *    preflight, used only when the primary model remains transiently down.
 *
 * All Gemini-specific details (SDK, models, error mapping) are isolated to this
 * file. Retries happen entirely inside this layer, so callers experience one
 * logical analysis request — no duplicate DB writes, no duplicate frontend
 * requests, and the prompt is never modified between attempts.
 */

/** @typedef {"TRANSIENT"|"RATE_LIMITED"|"RATE_LIMITED_QUOTA"|"AUTHENTICATION"|"INVALID_REQUEST"|"PERMANENT"} GeminiErrorType */

// Messages that indicate a project/daily quota exhaustion on a 429. These must
// fail fast — retrying a daily quota will never succeed within our budget.
const QUOTA_EXHAUSTED_PATTERN =
  /quota|resource[-_ ]?exhausted|per[-_ ]?day|daily|billing|limit.*(exceed|reach)/i;

function getStatus(error) {
  return error?.status ?? error?.code ?? null;
}

function getMessage(error) {
  return typeof error?.message === "string" ? error.message : "";
}

/**
 * Best-effort extraction of a server-provided retry hint (e.g. the `retryDelay`
 * detail Google includes on some 429/503 responses, or a Retry-After header).
 * Returns null when no practical hint exists.
 * @param {unknown} error
 * @returns {number|null} Milliseconds to wait, or null.
 */
function extractRetryAfterMs(error) {
  const candidates = [
    error?.retryAfterMs,
    error?.retryDelay,
    error?.details,
    error?.error?.details,
    error?.responseHeaders?.["retry-after"],
  ];

  for (const value of candidates) {
    if (typeof value === "number" && value > 0) return value;
    if (typeof value !== "string") continue;
    // "32s" style retryDelay strings.
    const seconds = value.trim().match(/^(\d+(?:\.\d+)?)s$/i);
    if (seconds) return Number(seconds[1]) * 1000;
    // Bare numeric string (classic Retry-After header, in seconds).
    if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  }
  return null;
}
/**
 * Classify a Gemini/SDK error into a predictable category that decides whether
 * retrying (and model fallback) is appropriate. Provider-specific status-code
 * parsing lives ONLY here — controllers and services never inspect raw errors.
 *
 * @param {unknown} error
 * @returns {{ type: GeminiErrorType, retryable: boolean, fallbackEligible: boolean, retryAfterMs: number|null }}
 */
export function classifyGeminiError(error) {
  const retryAfterMs = extractRetryAfterMs(error);

  // Errors already mapped by this service (timeout, empty response).
  if (error instanceof AppError) {
    if (error.details === "AI_TIMEOUT") {
      return { type: "TRANSIENT", retryable: true, fallbackEligible: true, retryAfterMs: null };
    }
    if (error.details === "AI_UNAVAILABLE" || error.statusCode === 503) {
      // Empty/malformed provider response — safe to retry once more.
      return { type: "TRANSIENT", retryable: true, fallbackEligible: true, retryAfterMs: null };
    }
    return { type: "PERMANENT", retryable: false, fallbackEligible: false, retryAfterMs: null };
  }

  const status = getStatus(error);
  const message = getMessage(error);

  // Google commonly reports an invalid/missing key as an HTTP 400 whose message
  // references the key name (never the key's value). Detect that first.
  if (/api[\s-]?key/i.test(message)) {
    return { type: "AUTHENTICATION", retryable: false, fallbackEligible: false, retryAfterMs: null };
  }

  if (status === 429) {
    // Quota exhaustion is NOT retryable within a request budget — fail fast.
    if (QUOTA_EXHAUSTED_PATTERN.test(message)) {
      return { type: "RATE_LIMITED_QUOTA", retryable: false, fallbackEligible: false, retryAfterMs: null };
    }
    // Temporary rate limit — retry, honoring the provider's retry hint.
    return { type: "RATE_LIMITED", retryable: true, fallbackEligible: false, retryAfterMs };
  }

  if (status === 401 || status === 403) {
    return { type: "AUTHENTICATION", retryable: false, fallbackEligible: false, retryAfterMs: null };
  }

  if (status === 400) {
    return { type: "INVALID_REQUEST", retryable: false, fallbackEligible: false, retryAfterMs: null };
  }

  if (status === 503 || status === 500 || status === 502 || status === 504) {
    // Temporary service/model unavailability (the classic "high demand" 503).
    return { type: "TRANSIENT", retryable: true, fallbackEligible: true, retryAfterMs };
  }

  // Network-level SDK failures usually carry no HTTP status at all.
  if (status == null) {
    return { type: "TRANSIENT", retryable: true, fallbackEligible: true, retryAfterMs: null };
  }

  return { type: "PERMANENT", retryable: false, fallbackEligible: false, retryAfterMs: null };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff with jitter: base * 2^(attempt-1) plus up to 25% random
 * jitter so simultaneous requests don't retry in lockstep. The provider's
 * retry-after hint (when practical, capped at 30s) overrides the computed delay.
 * @param {number} attempt - The attempt that just failed (1-based).
 * @param {number|null} retryAfterMs
 * @returns {number}
 */
function computeBackoffDelay(attempt, retryAfterMs) {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, 30_000);
  const exponential = env.aiRetryBaseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * exponential * 0.25;
  return Math.round(exponential + jitter);
}

class GeminiService {
  constructor() {
    this.apiKey = env.geminiApiKey;
    this.model = env.geminiModel;
    this._client = null;
    // Memoized availability preflight for the fallback model.
    this._fallbackAvailable = null;
  }

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  /**
   * Lazily create the SDK client on first use. Holding the key in an in-memory
   * client (never logged, never serialized) is all the SDK needs.
   * @returns {GoogleGenAI}
   */
  _getClient() {
    if (!this.isConfigured) {
      throw new AppError(
        "Gemini is not configured: GEMINI_API_KEY is missing.",
        500,
      );
    }

    if (!this._client) {
      this._client = new GoogleGenAI({ apiKey: this.apiKey });
    }

    return this._client;
  }

  /**
   * Generate text for a prompt, with the reliability layer applied:
   *
   *   primary model → transient failure → retry (bounded, backoff + jitter)
   *   → still unavailable → fallback model (if configured & available)
   *
   * Non-retryable errors (auth, malformed request, quota exhaustion) fail
   * immediately. Each HTTP attempt has a hard timeout (AI_REQUEST_TIMEOUT_MS).
   * Never logs the API key or the full prompt/response. Validation of the
   * returned text remains in analysisService for both models.
   *
   * @param {string} prompt - The text prompt to send to the model.
   * @returns {Promise<string>} The model's generated text.
   */
  async generateContent(prompt) {
    const client = this._getClient();
    const startedAt = Date.now();

    const models = [this.model];
    if (
      env.geminiFallbackModel &&
      env.geminiFallbackModel !== this.model &&
      this._isFallbackUsable(client)
    ) {
      models.push(env.geminiFallbackModel);
    }

    let lastError = null;
    let lastClassification = null;
    // Overall wall-clock budget across ALL attempts and models. Fast failures
    // (instant 503s) still allow the full retry ladder + fallback; only
    // slow/hanging attempts burn into the budget, bounding worst-case user
    // waiting to ~aiTotalBudgetMs instead of attempts × timeout.
    const deadlineAt = startedAt + env.aiTotalBudgetMs;

    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex];
      const isPrimary = modelIndex === 0;
      const maxAttempts = 1 + env.aiMaxRetries;

      logger.info(
        `Gemini request started (model=${model}, role=${isPrimary ? "primary" : "fallback"})`,
      );

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const text = await this._requestOnce(client, model, prompt);
          logger.info(
            `Gemini analysis succeeded (model=${model}, attempt=${attempt}, ` +
              `durationMs=${Date.now() - startedAt})`,
          );
          return text;
        } catch (error) {
          lastError = error;
          lastClassification = classifyGeminiError(error);

          // Detailed reason stays in server logs only — never surfaced to users.
          logger.warn(
            `Gemini attempt failed (model=${model}, attempt=${attempt}/${maxAttempts}, ` +
              `category=${lastClassification.type}, retryable=${lastClassification.retryable}, ` +
              `fallbackEligible=${lastClassification.fallbackEligible})`,
          );

          if (!lastClassification.retryable) {
            throw this._mapError(lastError, lastClassification);
          }

          // Budget spent? Stop retrying — fail with a clean error promptly.
          if (Date.now() >= deadlineAt) {
            logger.warn(
              `Gemini retry budget exhausted (durationMs=${Date.now() - startedAt}, ` +
                `budgetMs=${env.aiTotalBudgetMs}); stopping retries`,
            );
            throw this._mapError(lastError, lastClassification);
          }

          if (attempt < maxAttempts) {
            const delayMs = computeBackoffDelay(attempt, lastClassification.retryAfterMs);
            logger.warn(
              `Gemini ${lastClassification.type} — retry ${attempt}/${maxAttempts - 1} in ${delayMs}ms`,
            );
            await sleep(delayMs);
          }
        }
      }

      // This model exhausted its retry budget; move to the fallback if any —
      // but only if the overall time budget still allows it.
      if (modelIndex < models.length - 1 && Date.now() < deadlineAt) {
        logger.info(
          `Falling back to alternate model=${models[modelIndex + 1]} ` +
            `after ${model} remained unavailable`,
        );
      } else {
        break;
      }
    }

    // All models and retries exhausted — classify the last failure.
    logger.error(
      `Gemini analysis failed after all retries and fallback ` +
        `(category=${lastClassification?.type ?? "UNKNOWN"}, ` +
        `durationMs=${Date.now() - startedAt})`,
    );
    throw this._mapError(lastError, lastClassification);
  }

  /**
   * One bounded HTTP request to a specific model. A per-attempt AbortController
   * (AI_REQUEST_TIMEOUT_MS) cancels the underlying request so nothing hangs
   * indefinitely; the timeout surfaces as a clean AppError that classifies as
   * TRANSIENT and is retried within the configured retry budget.
   * @param {GoogleGenAI} client
   * @param {string} model
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async _requestOnce(client, model, prompt) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.aiRequestTimeoutMs);

    try {
      const response = await Promise.race([
        client.models.generateContent({
          model,
          contents: prompt,
          config: { abortSignal: controller.signal },
        }),
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(
              new AppError(
                "The analysis took too long to complete. Please try again.",
                504,
                "AI_TIMEOUT",
              ),
            );
          });
        }),
      ]);

      return this._extractText(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Verify the fallback model is actually available to the current Gemini API
   * setup before relying on it (a wrong model name would otherwise surface as
   * an INVALID_REQUEST 400 at the worst possible moment). Best-effort and
   * memoized: if listing fails for a transient reason we assume the model is
   * usable and let the request itself decide. A confirmed-unavailable model is
   * permanently excluded for the process lifetime.
   * @param {GoogleGenAI} client
   * @returns {boolean}
   */
  _isFallbackUsable(client) {
    if (this._fallbackAvailable !== null) return this._fallbackAvailable;

    // Assume usable for the first call; verification runs in the background and
    // updates the flag for subsequent requests.
    this._fallbackAvailable = true;
    void (async () => {
      try {
        const names = [];
        for await (const m of client.models.list()) {
          names.push(String(m?.name ?? "").replace(/^models\//, ""));
        }
        this._fallbackAvailable = names.includes(env.geminiFallbackModel);
        if (!this._fallbackAvailable) {
          logger.warn(
            `Fallback model "${env.geminiFallbackModel}" is not available to ` +
              "this API key; model fallback disabled.",
          );
        }
      } catch (error) {
        // Can't verify — assume usable rather than blocking the fallback path.
        this._fallbackAvailable = true;
        logger.warn("Could not verify fallback model availability; proceeding optimistically.");
        logger.debug(String(error?.message ?? error));
      }
    })();

    return this._fallbackAvailable;
  }

  /**
   * Pull the generated text out of the SDK response, guarding against empty or
   * malformed responses. `response.text` is a convenience accessor provided by
   * the SDK; we additionally fall back to the raw candidate parts for safety.
   * @param {object} response
   * @returns {string}
   */
  _extractText(response) {
    const text = response?.text;
    if (typeof text === "string" && text.trim() !== "") {
      return text;
    }

    // Fall back to the first text part across candidates.
    const candidate = response?.candidates?.find(
      (c) => c?.content?.parts?.length,
    );
    const partText = candidate?.content?.parts?.find(
      (p) => typeof p?.text === "string",
    )?.text;
    if (typeof partText === "string" && partText.trim() !== "") {
      return partText;
    }

    throw new AppError(
      "The AI service returned an unexpected response. Please try again later.",
      502,
      "AI_UNAVAILABLE",
    );
  }

  /**
   * Translate a classified failure into a clean, provider-neutral AppError.
   * Never exposes internals: no Gemini payloads, no API key info, no stack
   * traces, no model configuration. Detailed reasons live in server logs only.
   * @param {unknown} error
   * @param {{ type: GeminiErrorType }|null} classification
   * @returns {AppError}
   */
  _mapError(error, classification = null) {
    const category = classification ?? classifyGeminiError(error);
    const message = getMessage(error);

    // Configuration problem (no API key) — keep the actionable dev message.
    if (error instanceof AppError && error.statusCode === 500) {
      return error;
    }

    switch (category.type) {
      case "TRANSIENT":
        logger.error("Gemini unavailable after all retries (transient provider failure).");
        return new AppError(
          "We couldn't complete the AI analysis right now. Please try again shortly.",
          503,
          "AI_UNAVAILABLE",
        );

      case "RATE_LIMITED":
      case "RATE_LIMITED_QUOTA":
        logger.warn(`Gemini rate limit (${category.type}). Message: ${message.slice(0, 200)}`);
        if (category.retryAfterMs > 0) {
          logger.warn(`retryAfterSeconds=${Math.round(category.retryAfterMs / 1000)}`);
        }
        {
          const rateLimited = new AppError(
            category.retryAfterMs > 0
              ? "AI analysis is temporarily rate-limited."
              : "AI analysis is temporarily rate-limited. Please try again later.",
            429,
            "AI_RATE_LIMITED",
          );
          // Safe, provider-derived retry hint for the frontend countdown.
          rateLimited.retryAfterSeconds =
            category.retryAfterMs > 0 ? Math.round(category.retryAfterMs / 1000) : null;
          return rateLimited;
        }

      case "AUTHENTICATION":
        logger.error("Gemini authentication/authorization failed: invalid or missing API key.");
        return new AppError(
          "AI analysis is temporarily unavailable.",
          502,
          "AI_AUTH_ERROR",
        );

      case "INVALID_REQUEST":
        logger.error(`Gemini rejected the request as invalid. Message: ${message.slice(0, 200)}`);
        return new AppError(
          "AI analysis is temporarily unavailable.",
          502,
          "AI_AUTH_ERROR",
        );

      default:
        logger.error(`Gemini request failed permanently. Message: ${message.slice(0, 200)}`);
        return new AppError(
          "Something went wrong while analyzing your resume. Please try again.",
          502,
          "AI_UNKNOWN_ERROR",
        );
    }
  }
}

export const gemini = new GeminiService();
