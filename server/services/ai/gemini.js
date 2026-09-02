import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { AppError } from "../../utils/errors.js";

/**
 * Thin, server-only wrapper around the official Google Gemini SDK.
 *
 * The API key is read from `GEMINI_API_KEY` in the environment and must never be
 * exposed to the client. All Gemini-specific details (SDK, model, error mapping)
 * are isolated to this file so the rest of the app only depends on
 * `gemini.generateContent()`.
 *
 * The SDK client is created lazily and only ever runs on the server. It is never
 * imported by the frontend, so the key can't leak into a client bundle.
 */
class GeminiService {
  constructor() {
    this.apiKey = env.geminiApiKey;
    this.model = env.geminiModel;
    this._client = null;
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
   * Generate text for a prompt using the configured Gemini model.
   *
   * Never logs the API key or the full prompt/response. Errors are mapped to
   * friendly, non-leaking AppErrors so the centralized error middleware can
   * render them consistently.
   *
   * @param {string} prompt - The text prompt to send to the model.
   * @returns {Promise<string>} The model's generated text.
   */
  async generateContent(prompt) {
    const client = this._getClient();

    try {
      const response = await client.models.generateContent({
        model: this.model,
        contents: prompt,
      });

      return this._extractText(response);
    } catch (error) {
      throw this._mapError(error);
    }
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
      "Gemini returned an empty or unexpected response — no generated text found.",
      502,
    );
  }

  /**
   * Translate SDK/API failures into clean AppErrors without exposing internals,
   * stack traces, the API key, or the full request/response payloads.
   * @param {Error} error - Error thrown by the SDK.
   * @returns {AppError}
   */
  _mapError(error) {
    if (error instanceof AppError) {
      return error;
    }

    // The SDK exposes an HTTP-like status and a string code on API errors.
    const status = error?.status ?? error?.code ?? null;
    const message = error?.message || "Gemini API request failed.";

    // Google commonly reports an invalid/missing key as an HTTP 400 whose
    // message references the key name (never the key's value). Detect that first
    // so the user gets a clear, actionable error about the key itself.
    if (/api[\s-]?key/i.test(message)) {
      logger.error("Gemini authentication failed: invalid or missing API key.");
      return new AppError(
        "Gemini authentication failed. Verify GEMINI_API_KEY.",
        502,
      );
    }

    // Call rejects the request itself: bad model name, malformed body, etc.
    if (status === 400) {
      return new AppError(
        "Gemini rejected the request (model or request is invalid).",
        400,
      );
    }

    // Auth/permissions problems — never echo the key or its value.
    if (status === 401 || status === 403) {
      logger.error("Gemini authentication/authorization failed.");
      return new AppError(
        "Gemini rejected the API key. Verify GEMINI_API_KEY.",
        502,
      );
    }

    // Rate limiting — surface it so clients can back off.
    if (status === 429) {
      return new AppError(
        "Gemini rate limit reached. Please retry later.",
        429,
      );
    }

    // Everything else (network, quota, 5xx, unknown): keep it generic.
    logger.error(`Gemini API error: ${message}`);
    return new AppError(
      "Gemini API request failed. Please try again later.",
      502,
    );
  }
}

export const gemini = new GeminiService();
