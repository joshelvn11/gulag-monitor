import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildQueryString, closeAlert, fetchJson } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  localStorage.clear();
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
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("adds x-api-key header when configured in localStorage", async () => {
    localStorage.setItem("monitor_api_key", "local-test-key");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchJson("/v1/status/summary");

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/status/summary",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-api-key": "local-test-key",
        }),
      })
    );
  });
});
