import { MonitorConfig } from "./types.js";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function envCsv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function loadConfig(): MonitorConfig {
  const isRender = Boolean(process.env.RENDER);
  const defaultHost = isRender ? "0.0.0.0" : "127.0.0.1";
  const defaultPort = envInt("PORT", 7410);

  return {
    host: process.env.MONITOR_HOST ?? defaultHost,
    port: envInt("MONITOR_PORT", defaultPort),
    dbPath: process.env.MONITOR_DB_PATH ?? "./monitor.sqlite",
    apiKey: process.env.MONITOR_API_KEY ?? "",
    authEnabled: envBool("MONITOR_AUTH_ENABLED", true),
    authSecret: process.env.MONITOR_AUTH_SECRET ?? "",
    authBaseUrl:
      process.env.MONITOR_AUTH_BASE_URL ??
      process.env.BETTER_AUTH_URL ??
      process.env.RENDER_EXTERNAL_URL ??
      "",
    authTrustedOrigins: envCsv("MONITOR_AUTH_TRUSTED_ORIGINS"),
    authAdminEmail: process.env.MONITOR_AUTH_ADMIN_EMAIL ?? "",
    authAdminPassword: process.env.MONITOR_AUTH_ADMIN_PASSWORD ?? "",
    retentionDays: envInt("MONITOR_RETENTION_DAYS", 30),
    evaluatorIntervalSeconds: envInt("MONITOR_EVALUATOR_INTERVAL_SECONDS", 15),
    retentionIntervalSeconds: envInt("MONITOR_RETENTION_INTERVAL_SECONDS", 3600),
  };
}
