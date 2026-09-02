import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getErrorMessage } from "../services/api.js";
import PageContainer from "../components/layout/PageContainer.jsx";
import Button from "../components/common/Button.jsx";
import Input from "../components/common/Input.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Could not create your account."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer
      title="Create your account"
      subtitle="Save and revisit your analyses"
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
        <Input
          label="Name"
          type="text"
          value={form.name}
          onChange={update("name")}
          required
          autoComplete="name"
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={update("email")}
          required
          autoComplete="email"
        />
        <Input
          label="Password (min. 8 characters)"
          type="password"
          value={form.password}
          onChange={update("password")}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Input
          label="Confirm password"
          type="password"
          value={form.confirm}
          onChange={update("confirm")}
          required
          autoComplete="new-password"
        />
        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
        <p className="text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary">
            Log in
          </Link>
        </p>
      </form>
    </PageContainer>
  );
}
