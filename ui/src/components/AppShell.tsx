import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { PropsWithChildren } from "react";

import { authClient } from "../lib/auth";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/jobs", label: "Jobs" },
  { to: "/alerts", label: "Alerts" },
  { to: "/events", label: "Events" },
];

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await authClient.signOut();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="brand">
          <span className="brand__dot" aria-hidden="true" />
          <div>
            <h1>Gulag Monitor</h1>
            <p>Operational telemetry dashboard</p>
          </div>
        </div>
        <div className="shell__header-actions">
          <nav className="nav" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav__link${isActive ? " is-active" : ""}`}
                end={item.to === "/"}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="auth-nav">
            <span className="auth-nav__user mono">{session.data?.user.email ?? "Signed In"}</span>
            <button type="button" className="button" onClick={onSignOut} disabled={signingOut}>
              {signingOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </header>
      <main className="shell__content">{children}</main>
    </div>
  );
}
