const UI_ENV_API_KEY = import.meta.env.VITE_MONITOR_API_KEY?.trim() ?? "";
function resolveApiKey() {
    if (UI_ENV_API_KEY) {
        return UI_ENV_API_KEY;
    }
    const storage = typeof globalThis !== "undefined" && "localStorage" in globalThis
        ? globalThis.localStorage
        : typeof window !== "undefined"
            ? window.localStorage
            : null;
    if (!storage) {
        return "";
    }
    const fromLocalStorage = (storage.getItem("monitor_api_key") ??
        storage.getItem("MONITOR_API_KEY") ??
        "").trim();
    return fromLocalStorage;
}
export function buildQueryString(params) {
    const search = new URLSearchParams();
    for (const [key, rawValue] of Object.entries(params)) {
        if (rawValue === null || rawValue === undefined) {
            continue;
        }
        const value = String(rawValue).trim();
        if (!value) {
            continue;
        }
        search.set(key, value);
    }
    return search.toString();
}
async function parseError(response) {
    try {
        const body = await response.json();
        if (body && typeof body === "object" && "error" in body) {
            const error = body.error;
            if (typeof error === "string" && error.trim()) {
                return error;
            }
        }
    }
    catch {
        // Ignore parse errors and fallback to text/status.
    }
    const text = await response.text();
    if (text.trim()) {
        return text;
    }
    return `HTTP ${response.status}`;
}
export async function fetchJson(path) {
    const apiKey = resolveApiKey();
    const headers = { Accept: "application/json" };
    if (apiKey) {
        headers["x-api-key"] = apiKey;
    }
    const response = await fetch(path, {
        headers,
    });
    if (!response.ok) {
        const message = await parseError(response);
        throw new Error(message);
    }
    return (await response.json());
}
export async function postJson(path, body) {
    const apiKey = resolveApiKey();
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
    };
    if (apiKey) {
        headers["x-api-key"] = apiKey;
    }
    const response = await fetch(path, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
        const message = await parseError(response);
        throw new Error(message);
    }
    return (await response.json());
}
export function getSummary() {
    return fetchJson("/v1/status/summary");
}
export function getJobsStatus() {
    return fetchJson("/v1/status/jobs");
}
export function getJobDetails(jobName) {
    return fetchJson(`/v1/status/jobs/${encodeURIComponent(jobName)}`);
}
export function getAlerts(params = {}) {
    const query = buildQueryString({
        jobName: params.jobName,
        status: params.status,
        alertType: params.alertType,
        severity: params.severity,
        limit: params.limit,
        offset: params.offset,
    });
    return fetchJson(`/v1/alerts${query ? `?${query}` : ""}`);
}
export function getEvents(params = {}) {
    const query = buildQueryString({
        jobName: params.jobName,
        scriptPath: params.scriptPath,
        level: params.level,
        eventType: params.eventType,
        from: params.from,
        to: params.to,
        limit: params.limit,
        offset: params.offset,
    });
    return fetchJson(`/v1/events${query ? `?${query}` : ""}`);
}
export function closeAlert(alertId, reason = "manual-ui") {
    return postJson(`/v1/alerts/${encodeURIComponent(String(alertId))}/close`, { reason });
}
