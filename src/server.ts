import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express, { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { createMonitorAuth } from "./auth/index.js";
import { loadConfig } from "./config.js";
import { createDbClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { MonitorService } from "./services/monitorService.js";

const eventSchema = z.object({
  sourceType: z.enum(["chief", "worker", "monitor"]),
  eventType: z.string().min(1),
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"]),
  message: z.string().min(1),
  eventAt: z.string().optional(),
  jobName: z.string().optional(),
  scriptPath: z.string().optional(),
  runId: z.string().optional(),
  scheduledFor: z.string().optional(),
  success: z.boolean().optional(),
  returnCode: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const eventBatchSchema = z.union([
  z.array(eventSchema),
  z.object({ events: z.array(eventSchema) }),
]);
const closeAlertSchema = z.object({
  reason: z.string().trim().min(1).max(200).optional(),
});
const alertEmailSettingsSchema = z.object({
  recipients: z.array(z.string().trim().email()).max(50),
  enabledAlertTypes: z.array(z.enum(["FAILURE", "MISSED", "RECOVERY"])),
});

function coercePositiveInt(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== "string") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function authenticate(req: Request, configuredApiKey: string): boolean {
  if (!configuredApiKey) {
    return false;
  }
  const header = req.header("x-api-key") ?? "";
  return header === configuredApiKey;
}

function isHealthRoute(req: Request): boolean {
  return req.path === "/health";
}

function isTelemetryIngestRoute(req: Request): boolean {
  if (req.method !== "POST") {
    return false;
  }
  return req.path === "/events" || req.path === "/events/batch";
}

function extractSessionEmail(session: unknown): string | null {
  if (!session || typeof session !== "object") {
    return null;
  }
  const record = session as { user?: unknown };
  if (!record.user || typeof record.user !== "object") {
    return null;
  }
  const user = record.user as { email?: unknown };
  return typeof user.email === "string" && user.email.trim() ? user.email.trim().toLowerCase() : null;
}

function resolveUiDistPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../ui/dist"),
    path.resolve(moduleDir, "../../ui/dist"),
    path.resolve(process.cwd(), "ui/dist"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return candidates[0];
}

async function main(): Promise<void> {
  const config = loadConfig();
  runMigrations(config.dbPath);

  const { db, sqlite } = createDbClient(config.dbPath);
  const service = new MonitorService(db, config);
  const auth = createMonitorAuth(sqlite, config);

  const app = express();

  if (auth) {
    auth.mountAuthRoutes(app);
    await auth.ensureSeedAdmin();
  }

  app.use(express.json({ limit: "2mb" }));

  app.use("/v1", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (isHealthRoute(req)) {
        return next();
      }

      const apiKeyIsConfigured = Boolean(config.apiKey);
      const hasValidApiKey = authenticate(req, config.apiKey);

      if (isTelemetryIngestRoute(req)) {
        if (!apiKeyIsConfigured || hasValidApiKey) {
          return next();
        }
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (hasValidApiKey) {
        return next();
      }

      if (auth) {
        const session = await auth.getSessionFromRequest(req);
        if (session) {
          return next();
        }
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!apiKeyIsConfigured) {
        return next();
      }

      return res.status(401).json({ error: "Unauthorized" });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/v1/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "chief-monitor",
      now: new Date().toISOString(),
      dbPath: config.dbPath,
    });
  });

  app.post("/v1/events", (req: Request, res: Response) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid event payload", details: parsed.error.flatten() });
    }

    const result = service.ingestEvents([parsed.data]);
    return res.status(202).json(result);
  });

  app.post("/v1/events/batch", (req: Request, res: Response) => {
    const parsed = eventBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid batch payload", details: parsed.error.flatten() });
    }

    const events = Array.isArray(parsed.data) ? parsed.data : parsed.data.events;
    const result = service.ingestEvents(events);
    return res.status(202).json(result);
  });

  app.get("/v1/status/summary", (_req: Request, res: Response) => {
    res.json(service.getSummary());
  });

  app.get("/v1/status/jobs", (_req: Request, res: Response) => {
    res.json({ jobs: service.getJobsStatus() });
  });

  app.get("/v1/status/jobs/:jobName", (req: Request, res: Response) => {
    const details = service.getJobDetails(req.params.jobName);
    if (!details.check) {
      return res.status(404).json({ error: "Job not found in check state", jobName: req.params.jobName });
    }
    return res.json(details);
  });

  app.post("/v1/alerts/:alertId/close", (req: Request, res: Response) => {
    const alertId = Number.parseInt(req.params.alertId, 10);
    if (!Number.isFinite(alertId) || alertId <= 0) {
      return res.status(400).json({ error: "alertId must be a positive integer" });
    }

    const parsed = closeAlertSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid close payload", details: parsed.error.flatten() });
    }

    const reason = parsed.data.reason ?? "manual";
    const result = service.closeAlertById(alertId, reason);
    if (!result.found) {
      return res.status(404).json({ error: "Alert not found", alertId });
    }
    return res.json(result);
  });

  app.get("/v1/alerts", (req: Request, res: Response) => {
    const limit = coercePositiveInt(req.query.limit, 100, 1000);
    const offset = coercePositiveInt(req.query.offset, 0, 1_000_000);

    const rows = service.listAlerts({
      jobName: typeof req.query.jobName === "string" ? req.query.jobName : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      alertType: typeof req.query.alertType === "string" ? req.query.alertType : undefined,
      severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
      limit,
      offset,
    });

    res.json({ alerts: rows, limit, offset });
  });

  app.get("/v1/events", (req: Request, res: Response) => {
    const limit = coercePositiveInt(req.query.limit, 100, 1000);
    const offset = coercePositiveInt(req.query.offset, 0, 1_000_000);

    const rows = service.listEvents({
      jobName: typeof req.query.jobName === "string" ? req.query.jobName : undefined,
      scriptPath: typeof req.query.scriptPath === "string" ? req.query.scriptPath : undefined,
      level: typeof req.query.level === "string" ? req.query.level : undefined,
      eventType: typeof req.query.eventType === "string" ? req.query.eventType : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      limit,
      offset,
    });

    res.json({ events: rows, limit, offset });
  });

  app.get("/v1/settings/alerts/email", (_req: Request, res: Response) => {
    res.json(service.getAlertEmailSettings());
  });

  app.put("/v1/settings/alerts/email", (req: Request, res: Response) => {
    const parsed = alertEmailSettingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid email settings payload", details: parsed.error.flatten() });
    }

    try {
      const updated = service.saveAlertEmailSettings(parsed.data);
      return res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save email settings.";
      return res.status(400).json({ error: message });
    }
  });

  app.post("/v1/settings/alerts/email/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = service.getAlertEmailSettings();
      if (!settings.providerConfigured) {
        return res.status(400).json({
          attempted: 0,
          sent: 0,
          failed: 0,
          message: "Resend email provider is not configured.",
        });
      }

      if (settings.recipients.length === 0) {
        return res.status(400).json({
          attempted: 0,
          sent: 0,
          failed: 0,
          message: "No alert email recipients configured.",
        });
      }

      const session = auth ? await auth.getSessionFromRequest(req) : null;
      const requestedByEmail = extractSessionEmail(session);

      try {
        const result = await service.sendTestAlertEmail(requestedByEmail);
        return res.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send test email.";
        return res.status(502).json({
          attempted: settings.recipients.length,
          sent: 0,
          failed: settings.recipients.length,
          message,
        });
      }
    } catch (error) {
      return next(error);
    }
  });

  const uiDistPath = resolveUiDistPath();
  const uiIndexPath = path.join(uiDistPath, "index.html");
  if (fs.existsSync(uiIndexPath)) {
    app.use(express.static(uiDistPath));

    app.get("*", (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/v1") || req.path.startsWith("/api/auth")) {
        return next();
      }
      return res.sendFile(uiIndexPath);
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `Monitor UI build not found at ${uiDistPath}. Running API-only mode. Run \"npm run ui:build\" in monitor/.`
    );
  }

  const loops = service.startBackgroundLoops();

  const server = app.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(`chief-monitor listening on http://${config.host}:${config.port}`);
  });

  const shutdown = () => {
    for (const handle of loops) {
      clearInterval(handle);
    }
    server.close(() => {
      sqlite.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start chief-monitor", error);
  process.exit(1);
});
