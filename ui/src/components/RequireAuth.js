import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, useLocation } from "react-router-dom";
import { authClient } from "../lib/auth";
export function RequireAuth({ children }) {
    const location = useLocation();
    const { data, isPending } = authClient.useSession();
    if (isPending) {
        return (_jsx("section", { className: "auth-shell", children: _jsx("article", { className: "card auth-card", children: _jsx("p", { className: "muted", children: "Checking session..." }) }) }));
    }
    if (!data?.session) {
        const nextPath = `${location.pathname}${location.search}${location.hash}`;
        return _jsx(Navigate, { to: `/login?next=${encodeURIComponent(nextPath)}`, replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
