import { FormEvent, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { ErrorBanner } from "../components/ErrorBanner";
import { authClient } from "../lib/auth";

function resolveNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  if (raw === "/login") {
    return "/";
  }
  return raw;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = authClient.useSession();

  const nextPath = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return resolveNextPath(search.get("next"));
  }, [location.search]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (session.data?.session) {
    return <Navigate to={nextPath} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setErrorMessage("");
    setSubmitting(true);

    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
        rememberMe: true,
      });

      if (result.error) {
        setErrorMessage(result.error.message || "Invalid login credentials.");
        return;
      }

      await authClient.getSession();
      navigate(nextPath, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-shell">
      <article className="card auth-card">
        <header className="auth-card__header">
          <h2>Gulag Monitor Login</h2>
        </header>

        {errorMessage ? (
          <ErrorBanner title="Sign in failed" message={errorMessage} />
        ) : null}

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            className="button button--primary"
            disabled={submitting || session.isPending}
          >
            {submitting ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </article>
    </section>
  );
}
