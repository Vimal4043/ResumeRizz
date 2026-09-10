/**
 * Email OTP sending (production path only).
 *
 * The OTP is always delivered via the Resend HTTP API (no SMTP required).
 * There is no dev/test fallback: if Resend is not configured or the send
 * fails, the call throws and the controller surfaces the failure instead
 * of leaking the code to logs or temp files.
 *
 * Security:
 *   - The plaintext OTP is only ever held in memory for the duration of the
 *     send call and is never written to logs or disk.
 *   - Rate limiting on the /api/auth/otp/send and /verify endpoints prevents
 *     abuse (wired in authRoutes.js).
 *   - Per-account attempt limits (otpAttempts) prevent brute force on the OTP code.
 *   - The RESEND_API_KEY is never logged or exposed to the client.
 */

import { env } from "../config/env.js";
import { logger } from "./logger.js";

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Send a 6-digit OTP to the user's email via the Resend HTTP API.
 *
 * @param {string} to - lower-case email address.
 * @param {string} code - 6-digit numeric OTP plaintext.
 * @returns {Promise<void>}
 * @throws {Error} EMAIL_SERVICE_NOT_CONFIGURED when Resend env is missing.
 * @throws {Error} EMAIL_SEND_FAILED when the provider rejects the send.
 */
export async function sendOtpEmail(to, code) {
  const subject = "Your ResumeRizz verification code";
  const html = `
    <p>Hi there,</p>
    <p>Your verification code for ResumeRizz is:</p>
    <p style="font-size: 1.6em; letter-spacing: 0.3em; font-weight: bold; margin: 1em 0;">${code}</p>
    <p>This code expires in 10 minutes. Please enter it on the verification screen.</p>
    <p>If you did not request this code, you can safely ignore this email.</p>
    <hr style="margin-top: 1.5em; border: none; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; font-size: 0.85em;">ResumeRizz — ${new Date().toISOString().slice(0, 10)}</p>
  `.replace(/>\s+</g, "><").trim();

  const text = [
    "Hi there,",
    "",
    "Your verification code for ResumeRizz is:",
    code,
    "",
    "This code expires in 10 minutes. Please enter it on the verification screen.",
    "",
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n");

  // Require both the API key and a verified sender address.
  if (!env.resendApiKey || !env.resendFrom) {
    logger.error(
      "sendOtpEmail: Resend not configured (RESEND_API_KEY=%s, RESEND_FROM=%s)",
      env.resendApiKey ? "set" : "missing",
      env.resendFrom ? "set" : "missing",
    );
    throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  }

  const body = JSON.stringify({
    from: env.resendFrom,
    to,
    subject,
    html,
    text,
  });

  const fetchOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body,
  };

  // 20-second timeout — Resend is fast, but we never want to hang the request.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(RESEND_API_URL, {
      ...fetchOptions,
      signal: controller.signal,
    });
    const status = res.status;

    if (!res.ok) {
      // Read the Resend error body for diagnostics.
      let errorBody = "";
      try {
        errorBody = await res.text();
      } catch {
        errorBody = "(could not read response body)";
      }
      logger.error(
        "Resend API error: status=%s, body=%s",
        status,
        errorBody,
      );
      throw new Error("EMAIL_SEND_FAILED");
    }

    logger.info("OTP email sent to %s (Resend status %s)", to, status);
  } catch (err) {
    if (err.message === "EMAIL_SEND_FAILED") {
      throw err; // Re-throw our own EMAIL_SEND_FAILED errors as-is.
    }
    // Network errors, aborts, JSON parse failures, etc.
    logger.error("Resend request failed for %s: %s", to, err.message);
    throw new Error("EMAIL_SEND_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
