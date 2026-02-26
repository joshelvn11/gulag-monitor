import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth";
const navItems = [
    { to: "/", label: "Overview" },
    { to: "/jobs", label: "Jobs" },
    { to: "/alerts", label: "Alerts" },
    { to: "/events", label: "Events" },
    { to: "/settings", label: "Settings" },
];
export function AppShell({ children }) {
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
        }
        finally {
            setSigningOut(false);
        }
    };
    return (_jsxs("div", { className: "shell", children: [_jsxs("header", { className: "shell__header", children: [_jsxs("div", { className: "brand", children: [_jsx("span", { className: "brand__dot", "aria-hidden": "true" }), _jsxs("div", { children: [_jsx("h1", { children: "Gulag Monitor" }), _jsx("p", { children: "Operational telemetry dashboard" })] })] }), _jsxs("div", { className: "shell__header-actions", children: [_jsx("nav", { className: "nav", "aria-label": "Primary", children: navItems.map((item) => (_jsx(NavLink, { to: item.to, className: ({ isActive }) => `nav__link${isActive ? " is-active" : ""}`, end: item.to === "/", children: item.label }, item.to))) }), _jsxs("div", { className: "auth-nav", children: [_jsx("span", { className: "auth-nav__user mono", children: session.data?.user.email ?? "Signed In" }), _jsx("button", { type: "button", className: "button", onClick: onSignOut, disabled: signingOut, children: signingOut ? "Signing Out..." : "Sign Out" })] })] })] }), _jsx("main", { className: "shell__content", children: children })] }));
}
