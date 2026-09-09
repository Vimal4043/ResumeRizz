import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { sendOtp, verifyOtp } from "../services/authService.js";
import { getErrorMessage } from "../services/api.js";
import PageContainer from "../components/layout/PageContainer.jsx";
import Button from "../components/common/Button.jsx";
import Input from "../components/common/Input.jsx";

/**
 * Email verification (OTP) page.
 *
 * Reached after registration (Register redirects here with the email in
 * location.state) or when a user needs to verify their email. The user enters
 * the 6-digit code sent to their email.
 *
 * On success, the user is marked as verified and redirected to the dashboard.
 */
export default function OtpVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser } = useAuth();

  // Email comes from the register flow (location.state?.email) or from the
  // already-authenticated user.
  const [email, setEmail] = useState(
    location.state?.email || user?.email || "",
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleResend() {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }
    setSending(true);
    setError("");
    setInfo("");
    try {
      await sendOtp(email.trim());
      setInfo("A new verification code has been sent to your email.");
    } catch (err) {
      setError(getErrorMessage(err, "Could not send verification code."));
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!/^\d{6}$/.test(code)) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    try {
      await verifyOtp({ email: email.trim(), code });
      // Refresh the user so isVerified is reflected, then go to dashboard.
      if (refreshUser) await refreshUser();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Could not verify code."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer
      title="Verify your email"
      subtitle="Enter the 6-digit code sent to your email"
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        {error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-text">
            {info}
          </p>
        )}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          label="Verification code"
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          placeholder="000000"
          autoComplete="one-time-code"
        />
        <Button type="submit" loading={loading} className="w-full">
          Verify email
        </Button>
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="w-full text-center text-sm text-text-muted hover:text-primary disabled:opacity-50"
        >
          {sending ? "Sending…" : "Resend code"}
        </button>
      </form>
    </PageContainer>
  );
}