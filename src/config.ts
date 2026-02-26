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

export function loadConfig(): MonitorConfig {
  return {
    host: process.env.MONITOR_HOST ?? "127.0.0.1",
    port: envInt("MONITOR_PORT", 7410),
    dbPath: process.env.MONITOR_DB_PATH ?? "./monitor.sqlite",
    apiKey: process.env.MONITOR_API_KEY ?? "",
    authEnabled: envBool("MONITOR_AUTH_ENABLED", true),
    authSecret: process.env.MONITOR_AUTH_SECRET ?? "",
    authAdminEmail: process.env.MONITOR_AUTH_ADMIN_EMAIL ?? "",
    authAdminPassword: process.env.MONITOR_AUTH_ADMIN_PASSWORD ?? "",
    retentionDays: envInt("MONITOR_RETENTION_DAYS", 30),
    evaluatorIntervalSeconds: envInt("MONITOR_EVALUATOR_INTERVAL_SECONDS", 15),
    retentionIntervalSeconds: envInt("MONITOR_RETENTION_INTERVAL_SECONDS", 3600),
  };
}
