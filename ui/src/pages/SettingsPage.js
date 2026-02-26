import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { getAlertEmailSettings, sendTestAlertEmail, updateAlertEmailSettings } from "../lib/api";
const ALERT_TYPE_ORDER = ["FAILURE", "MISSED", "RECOVERY"];
const MAX_RECIPIENTS = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
function splitRecipients(value) {
    return value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function normalizeRecipients(value) {
    const deduped = new Set();
    for (const item of splitRecipients(value)) {
        deduped.add(item.toLowerCase());
    }
    return [...deduped];
}
function formatRecipients(recipients) {
    return recipients.join("\n");
}
export function SettingsPage() {
    const queryClient = useQueryClient();
    const [recipientsInput, setRecipientsInput] = useState("");
    const [enabledAlertTypes, setEnabledAlertTypes] = useState(["FAILURE", "MISSED"]);
    const [validationError, setValidationError] = useState("");
    const [resultMessage, setResultMessage] = useState("");
    const query = useQuery({
        queryKey: ["settings", "alerts", "email"],
        queryFn: getAlertEmailSettings,
    });
    useEffect(() => {
        if (!query.data) {
            return;
        }
        setRecipientsInput(formatRecipients(query.data.recipients));
        setEnabledAlertTypes(query.data.enabledAlertTypes);
    }, [query.data]);
    const saveMutation = useMutation({
        mutationFn: updateAlertEmailSettings,
        onSuccess: async (updated) => {
            setValidationError("");
            setResultMessage("Email alert settings saved.");
            setRecipientsInput(formatRecipients(updated.recipients));
            setEnabledAlertTypes(updated.enabledAlertTypes);
            await queryClient.invalidateQueries({ queryKey: ["settings", "alerts", "email"] });
        },
    });
    const testMutation = useMutation({
        mutationFn: sendTestAlertEmail,
        onSuccess: (result) => {
            setResultMessage(result.message);
        },
    });
    const activeTypes = useMemo(() => ALERT_TYPE_ORDER.filter((type) => enabledAlertTypes.includes(type)), [enabledAlertTypes]);
    const onToggleType = (alertType) => {
        setEnabledAlertTypes((current) => {
            if (current.includes(alertType)) {
                return current.filter((type) => type !== alertType);
            }
            return [...current, alertType];
        });
    };
    const onSave = (event) => {
        event.preventDefault();
        setResultMessage("");
        setValidationError("");
        const recipients = normalizeRecipients(recipientsInput);
        if (recipients.length > MAX_RECIPIENTS) {
            setValidationError(`Maximum recipients exceeded (${MAX_RECIPIENTS}).`);
            return;
        }
        const invalidRecipient = recipients.find((recipient) => !EMAIL_PATTERN.test(recipient));
        if (invalidRecipient) {
            setValidationError(`Invalid recipient email: ${invalidRecipient}`);
            return;
        }
        saveMutation.mutate({
            recipients,
            enabledAlertTypes: activeTypes,
        });
    };
    const onTestEmail = () => {
        setResultMessage("");
        setValidationError("");
        testMutation.mutate();
    };
    return (_jsxs("section", { className: "stack", children: [_jsx(PageHeader, { title: "Alert Email Settings", subtitle: "Configure global recipients and alert types for email delivery." }), query.error ? _jsx(ErrorBanner, { message: query.error.message }) : null, validationError ? _jsx(ErrorBanner, { title: "Validation failed", message: validationError }) : null, saveMutation.error ? _jsx(ErrorBanner, { message: saveMutation.error.message }) : null, testMutation.error ? _jsx(ErrorBanner, { title: "Test email failed", message: testMutation.error.message }) : null, resultMessage ? _jsx("div", { className: "settings-notice", children: resultMessage }) : null, _jsxs("article", { className: "card settings-card", children: [_jsx("p", { className: `settings-provider ${query.data?.providerConfigured ? "is-configured" : "is-missing"}`, children: query.data?.providerConfigured
                            ? "Resend provider configured."
                            : "Resend provider is not configured. Set MONITOR_RESEND_API_KEY and MONITOR_RESEND_FROM_EMAIL." }), _jsxs("form", { className: "settings-form", onSubmit: onSave, children: [_jsxs("label", { children: ["Recipients (comma or newline separated)", _jsx("textarea", { value: recipientsInput, onChange: (event) => setRecipientsInput(event.target.value), placeholder: "ops@example.com\noncall@example.com", rows: 6 })] }), _jsxs("fieldset", { className: "settings-types", children: [_jsx("legend", { children: "Send Email For Alert Types" }), ALERT_TYPE_ORDER.map((alertType) => (_jsxs("label", { className: "settings-type-option", children: [_jsx("input", { type: "checkbox", checked: enabledAlertTypes.includes(alertType), onChange: () => onToggleType(alertType) }), _jsx("span", { children: alertType })] }, alertType)))] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { type: "submit", className: "button button--primary", disabled: query.isPending || saveMutation.isPending, children: saveMutation.isPending ? "Saving..." : "Save Settings" }), _jsx("button", { type: "button", className: "button", onClick: onTestEmail, disabled: query.isPending || testMutation.isPending, children: testMutation.isPending ? "Sending..." : "Test Email Alerts" })] })] })] })] }));
}
