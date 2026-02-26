import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { authClient } from "../lib/auth";

export function RequireAuth({ children }: PropsWithChildren) {
  const location = useLocation();
  const { data, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <section className="auth-shell">
        <article className="card auth-card">
          <p className="muted">Checking session...</p>
        </article>
      </section>
    );
  }

  if (!data?.session) {
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;
  }

  return <>{children}</>;
}
