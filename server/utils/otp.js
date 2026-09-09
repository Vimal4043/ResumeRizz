/**
 * Email OTP helpers (single source of truth lives in sendOtpEmail.js).
 *
 * This module re-exports the canonical implementation so older imports of
 * `utils/otp.js` keep working without duplicating the SMTP/dev-fallback logic.
 */
export { sendOtpEmail } from "./sendOtpEmail.js";