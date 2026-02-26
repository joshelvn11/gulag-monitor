import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { getAlertEmailSettings, sendTestAlertEmail, updateAlertEmailSettings } from "../lib/api";
import type { AlertEmailType } from "../lib/types";

const ALERT_TYPE_ORDER: AlertEmailType[] = ["FAILURE", "MISSED", "RECOVERY"];
const MAX_RECIPIENTS = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function splitRecipients(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeRecipients(value: string): string[] {
  const deduped = new Set<string>();
  for (const item of splitRecipients(value)) {
    deduped.add(item.toLowerCase());
  }
  return [...deduped];
}

function formatRecipients(recipients: string[]): string {
  return recipients.join("\n");
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [recipientsInput, setRecipientsInput] = useState("");
  const [enabledAlertTypes, setEnabledAlertTypes] = useState<AlertEmailType[]>(["FAILURE", "MISSED"]);
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

  const activeTypes = useMemo(
    () => ALERT_TYPE_ORDER.filter((type) => enabledAlertTypes.includes(type)),
    [enabledAlertTypes]
  );

  const onToggleType = (alertType: AlertEmailType) => {
    setEnabledAlertTypes((current) => {
      if (current.includes(alertType)) {
        return current.filter((type) => type !== alertType);
      }
      return [...current, alertType];
    });
  };

  const onSave = (event: FormEvent<HTMLFormElement>) => {
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

  return (
    <section className="stack">
      <PageHeader title="Alert Email Settings" subtitle="Configure global recipients and alert types for email delivery." />

      {query.error ? <ErrorBanner message={(query.error as Error).message} /> : null}
      {validationError ? <ErrorBanner title="Validation failed" message={validationError} /> : null}
      {saveMutation.error ? <ErrorBanner message={(saveMutation.error as Error).message} /> : null}
      {testMutation.error ? <ErrorBanner title="Test email failed" message={(testMutation.error as Error).message} /> : null}

      {resultMessage ? <div className="settings-notice">{resultMessage}</div> : null}

      <article className="card settings-card">
        <p className={`settings-provider ${query.data?.providerConfigured ? "is-configured" : "is-missing"}`}>
          {query.data?.providerConfigured
            ? "Resend provider configured."
            : "Resend provider is not configured. Set MONITOR_RESEND_API_KEY and MONITOR_RESEND_FROM_EMAIL."}
        </p>

        <form className="settings-form" onSubmit={onSave}>
          <label>
            Recipients (comma or newline separated)
            <textarea
              value={recipientsInput}
              onChange={(event) => setRecipientsInput(event.target.value)}
              placeholder={"ops@example.com\noncall@example.com"}
              rows={6}
            />
          </label>

          <fieldset className="settings-types">
            <legend>Send Email For Alert Types</legend>
            {ALERT_TYPE_ORDER.map((alertType) => (
              <label key={alertType} className="settings-type-option">
                <input
                  type="checkbox"
                  checked={enabledAlertTypes.includes(alertType)}
                  onChange={() => onToggleType(alertType)}
                />
                <span>{alertType}</span>
              </label>
            ))}
          </fieldset>

          <div className="inline-actions">
            <button type="submit" className="button button--primary" disabled={query.isPending || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Settings"}
            </button>
            <button type="button" className="button" onClick={onTestEmail} disabled={query.isPending || testMutation.isPending}>
              {testMutation.isPending ? "Sending..." : "Test Email Alerts"}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
