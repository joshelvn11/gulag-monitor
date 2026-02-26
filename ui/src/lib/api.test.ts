import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildQueryString, closeAlert, fetchJson, sendTestAlertEmail, updateAlertEmailSettings } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("buildQueryString", () => {
  it("includes only defined non-empty params", () => {
    const query = buildQueryString({
      jobName: "sample-etl-pipeline",
      status: "OPEN",
      empty: "",
      unknown: undefined,
      nullable: null,
      page: 2,
    });

    expect(query).toBe("jobName=sample-etl-pipeline&status=OPEN&page=2");
  });

  it("returns empty string when no usable params", () => {
    const query = buildQueryString({ a: "", b: undefined, c: null });
    expect(query).toBe("");
  });

  it("posts manual close requests for alerts", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        found: true,
        updated: true,
        reason: "manual-ui",
        alert: { id: 12, status: "CLOSED", closedAt: "2026-01-01T00:00:00Z" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await closeAlert(12);

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/alerts/12/close",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("sends same-origin credentials for session auth", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchJson("/v1/status/summary");

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/status/summary",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      })
    );
  });

  it("puts email alert settings with same-origin credentials", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        recipients: ["ops@example.com"],
        enabledAlertTypes: ["FAILURE"],
        providerConfigured: true,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await updateAlertEmailSettings({
      recipients: ["ops@example.com"],
      enabledAlertTypes: ["FAILURE"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/settings/alerts/email",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("posts test email endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ attempted: 1, sent: 1, failed: 0, message: "Test email sent." }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendTestAlertEmail();

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/settings/alerts/email/test",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      })
    );
  });
});
