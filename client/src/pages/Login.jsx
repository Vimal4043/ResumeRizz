import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getErrorMessage } from "../services/api.js";
import PageContainer from "../components/layout/PageContainer.jsx";
import Button from "../components/common/Button.jsx";
import Input from "../components/common/Input.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Could not log you in."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer title="Log in" subtitle="Welcome back">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        {error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
            {error}
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
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <Button type="submit" loading={loading} className="w-full">
          Log in
        </Button>
        <p className="text-center text-sm text-text-muted">
          No account yet?{" "}
          <Link to="/register" className="font-medium text-primary">
            Register
          </Link>
        </p>
      </form>
    </PageContainer>
  );
}
