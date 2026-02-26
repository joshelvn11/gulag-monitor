import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { authClient } from "../lib/auth";
function resolveNextPath(raw) {
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
        return _jsx(Navigate, { to: nextPath, replace: true });
    }
    const onSubmit = async (event) => {
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
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx("section", { className: "auth-shell", children: _jsxs("article", { className: "card auth-card", children: [_jsxs("header", { className: "auth-card__header", children: [_jsx("h2", { children: "Monitor Login" }), _jsx("p", { children: "Sign in with your local monitor account to view dashboard data." })] }), errorMessage ? _jsx(ErrorBanner, { title: "Sign in failed", message: errorMessage }) : null, _jsxs("form", { className: "auth-form", onSubmit: onSubmit, children: [_jsxs("label", { children: ["Email", _jsx("input", { type: "email", value: email, onChange: (event) => setEmail(event.target.value), autoComplete: "username", required: true })] }), _jsxs("label", { children: ["Password", _jsx("input", { type: "password", value: password, onChange: (event) => setPassword(event.target.value), autoComplete: "current-password", required: true })] }), _jsx("button", { type: "submit", className: "button button--primary", disabled: submitting || session.isPending, children: submitting ? "Signing In..." : "Sign In" })] })] }) }));
}
