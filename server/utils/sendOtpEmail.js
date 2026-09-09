/**
 * Email OTP sending (production path only).
 *
 * The OTP is always delivered via a real SMTP provider (nodemailer).
 * There is no dev/test fallback: if SMTP is not configured or the send
 * fails, the call throws and the controller surfaces the failure instead
 * of leaking the code to logs or temp files.
 *
 * Security:
 *   - The plaintext OTP is only ever held in memory for the duration of the
 *     send call and is never written to logs or disk.
 *   - Rate limiting on the /api/auth/otp/send and /verify endpoints prevents
 *     abuse (wired in authRoutes.js).
 *   - Per-account attempt limits (otpAttempts) prevent brute force on the OTP code.
 */

import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Build a nodemailer transporter from env, or null when SMTP is not configured.
 * @returns {import("nodemailer").Transporter | null}
 */
function buildTransporter() {
  if (!env.smtpHost || !env.smtpPort) return null;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: Number(env.smtpPort),
    secure: env.smtpSecure === "true" || env.smtpSecure === true,
    auth:
      env.smtpUser && env.smtpPass
        ? { user: env.smtpUser, pass: env.smtpPass }
        : undefined,
  });
}

/**
 * Send a 6-digit OTP to the user's email via SMTP.
 *
 * @param {string} to - lower-case email address.
 * @param {string} code - 6-digit numeric OTP plaintext.
 * @returns {Promise<void>}
 * @throws {Error} EMAIL_SERVICE_NOT_CONFIGURED when SMTP env is missing.
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

  const transporter = buildTransporter();
  if (!transporter) {
    logger.error("sendOtpEmail called with no SMTP configured");
    throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  }

  try {
    await transporter.sendMail({
      from: `"ResumeRizz" <${env.smtpFrom || env.smtpUser || "noreply@example.com"}>`,
      to,
      subject,
      html: html,
      text,
    });
    logger.info("OTP email sent to %s", to);
  } catch (err) {
    logger.error("Failed to send OTP email to %s: %s", to, err.message);
    if (err.response) {
      logger.error("sendOtpEmail: SMTP server response: %s", err.response);
    }
    throw new Error("EMAIL_SEND_FAILED");
  }
}