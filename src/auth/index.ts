import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import type { Express, Request } from "express";

import type { MonitorConfig } from "../types.js";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;

type MonitorAuth = {
  mountAuthRoutes: (app: Express) => void;
  getSessionFromRequest: (req: Request) => Promise<unknown | null>;
  ensureSeedAdmin: () => Promise<void>;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function resolveBaseUrl(config: MonitorConfig): string {
  const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  return `http://${host}:${config.port}`;
}

function resolveTrustedOrigins(config: MonitorConfig): string[] {
  const origins = new Set<string>();
  const baseUrl = resolveBaseUrl(config);
  origins.add(baseUrl);

  origins.add(`http://127.0.0.1:${config.port}`);
  origins.add(`http://localhost:${config.port}`);
  origins.add("http://127.0.0.1:5173");
  origins.add("http://localhost:5173");

  return [...origins];
}

function assertAuthConfig(config: MonitorConfig): void {
  const missing: string[] = [];
  if (!config.authSecret.trim()) {
    missing.push("MONITOR_AUTH_SECRET");
  }
  if (!config.authAdminEmail.trim()) {
    missing.push("MONITOR_AUTH_ADMIN_EMAIL");
  }
  if (!config.authAdminPassword) {
    missing.push("MONITOR_AUTH_ADMIN_PASSWORD");
  }
  if (missing.length > 0) {
    throw new Error(`Auth is enabled but required env vars are missing: ${missing.join(", ")}`);
  }
}

function createAuthInstance(sqlite: Database.Database, config: MonitorConfig, disableSignUp: boolean) {
  return betterAuth({
    baseURL: resolveBaseUrl(config),
    basePath: "/api/auth",
    secret: config.authSecret,
    database: sqlite,
    trustedOrigins: resolveTrustedOrigins(config),
    emailAndPassword: {
      enabled: true,
      disableSignUp,
    },
    session: {
      expiresIn: SEVEN_DAYS_SECONDS,
      updateAge: ONE_DAY_SECONDS,
    },
  });
}

function buildSeedHeaders(config: MonitorConfig): Headers {
  const baseUrl = new URL(resolveBaseUrl(config));
  return new Headers({
    origin: baseUrl.origin,
    host: baseUrl.host,
    "x-forwarded-host": baseUrl.host,
    "x-forwarded-proto": baseUrl.protocol.replace(":", ""),
  });
}

export function createMonitorAuth(sqlite: Database.Database, config: MonitorConfig): MonitorAuth | null {
  if (!config.authEnabled) {
    return null;
  }

  assertAuthConfig(config);

  const auth = createAuthInstance(sqlite, config, true);
  const authHandler = toNodeHandler(auth);

  const mountAuthRoutes = (app: Express) => {
    app.all("/api/auth", (req, res) => {
      void authHandler(req, res);
    });
    app.all("/api/auth/*", (req, res) => {
      void authHandler(req, res);
    });
  };

  const getSessionFromRequest = async (req: Request): Promise<unknown | null> => {
    try {
      return await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
    } catch {
      return null;
    }
  };

  const ensureSeedAdmin = async (): Promise<void> => {
    const email = normalizeEmail(config.authAdminEmail);
    const existing = sqlite
      .prepare('SELECT id FROM "user" WHERE "email" = ? LIMIT 1')
      .get(email) as { id: string } | undefined;
    if (existing) {
      return;
    }

    const seedAuth = createAuthInstance(sqlite, config, false);
    const defaultName = email.split("@")[0] || "admin";
    await seedAuth.api.signUpEmail({
      headers: buildSeedHeaders(config),
      body: {
        name: defaultName,
        email,
        password: config.authAdminPassword,
      },
    });
  };

  return {
    mountAuthRoutes,
    getSessionFromRequest,
    ensureSeedAdmin,
  };
}
