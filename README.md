# Gulag Monitor Guide

This is the single practical guide for running and operating Gulag Monitor (API + web UI + alerts) with Chief.

For deep implementation details, data model internals, and backend/UI architecture, see [`docs/MONITOR_TECHNICAL_GUIDE.md`](docs/MONITOR_TECHNICAL_GUIDE.md).

## 1. What Gulag Monitor Does

Gulag Monitor receives telemetry from Chief and workers, stores it in SQLite, and gives you:

- live system overview
- per-job health tracking
- alert feed (`FAILURE`, `MISSED`, `RECOVERY`)
- searchable event explorer
- manual alert close controls via UI or API

## 2. Prerequisites

- Node.js and npm
- Chief installed and configured (`chief/chief.yaml`)

## 3. Quick Start (Monitor + UI)

From repo root:

1. Install monitor dependencies

```bash
cd monitor
npm install
```

2. Run database migrations

```bash
npm run db:migrate
```

3. Start monitor

```bash
npm run dev
```

4. Open:

- Health: `http://127.0.0.1:7410/v1/health`
- Dashboard: `http://127.0.0.1:7410/`

5. In another terminal, run Chief to generate telemetry:

```bash
gulag-chief run --config chief/chief.yaml
```

## 4. Monitor UI Pages

- `/` System Overview: high-level health, alert totals, Chief runtime status
- `/jobs`: health state for each monitored job
- `/jobs/:jobName`: check state, open alerts, and recent events for one job
- `/alerts`: filter alerts and manually close open alerts
- `/events`: query raw telemetry with filters

## 5. Local Development Workflow

Terminal A (API):

```bash
cd monitor
npm run dev
```

Terminal B (UI hot reload):

```bash
cd monitor
npm run ui:install
npm run ui:dev
```

UI dev server:

- `http://127.0.0.1:5173`

It proxies `/v1` to the monitor API at `http://127.0.0.1:7410`.

## 6. Production Build + Run

```bash
cd monitor
npm run ui:build
npm run build
npm run start
```

After build, Express serves the UI at:

- `http://127.0.0.1:7410/`

If UI build output is missing, monitor starts in API-only mode.

## 6.1 Docker (Local)

Build and run with Docker Compose:

```bash
cd monitor
docker compose up --build -d
```

Open:

- Health: `http://127.0.0.1:7410/v1/health`
- Dashboard: `http://127.0.0.1:7410/`

Data persistence:

- SQLite lives in Docker volume `monitor-data` at `/data/monitor.sqlite`.

Stop:

```bash
docker compose down
```

## 6.2 Docker (Published Image)

Monitor images are published to GitHub Container Registry by CI:

- `ghcr.io/<owner>/chief-monitor:latest` on default branch pushes
- `ghcr.io/<owner>/chief-monitor:vX.Y.Z` and additional semver tags on version tags

Run a published image:

```bash
cd monitor
MONITOR_IMAGE=ghcr.io/<owner>/chief-monitor:latest docker compose up -d
```

If using API auth:

```bash
MONITOR_API_KEY=my-secret MONITOR_IMAGE=ghcr.io/<owner>/chief-monitor:latest docker compose up -d
```

## 7. Chief Configuration for Monitor

In `chief/chief.yaml`:

```yaml
monitor:
  enabled: true
  endpoint: http://127.0.0.1:7410
  api_key: ""
  timeout_ms: 400
  heartbeat_seconds: 15
  buffer:
    max_events: 5000
    flush_interval_ms: 1000
    spool_file: .chief/telemetry_spool.jsonl
```

Per-job override example:

```yaml
jobs:
  - name: sample-etl-pipeline
    monitor:
      enabled: true
      check:
        enabled: true
        grace_seconds: 120
        alert_on_failure: true
        alert_on_miss: true
```

## 8. Worker Monitoring Helper

Workers can emit custom telemetry through `gulag_chief.monitor_client`.

Example:

```python
from gulag_chief.monitor_client import monitor

monitor.info("extract started", source="orders-api")
monitor.warn("row quality warning", bad_rows=3)
monitor.error("load failed", table="fact_orders", reason="duplicate key")
```

Helper methods:

- `monitor.debug(...)`
- `monitor.info(...)`
- `monitor.warn(...)`
- `monitor.error(...)`
- `monitor.critical(...)`

Chief injects runtime context env vars for scripts it launches:

- `CHIEF_MONITOR_ENDPOINT`
- `CHIEF_MONITOR_API_KEY`
- `CHIEF_RUN_ID`
- `CHIEF_JOB_NAME`
- `CHIEF_SCRIPT_PATH`
- `CHIEF_SCHEDULED_FOR`

If running a worker directly (outside Chief), set at least:

```bash
export CHIEF_MONITOR_ENDPOINT=http://127.0.0.1:7410
```

## 9. Monitor Environment Variables

- `MONITOR_HOST` (default `127.0.0.1`)
- `MONITOR_PORT` (default `7410`)
- `MONITOR_DB_PATH` (default `./monitor.sqlite`)
- `MONITOR_API_KEY` (optional)
- `MONITOR_RETENTION_DAYS` (default `30`)
- `MONITOR_EVALUATOR_INTERVAL_SECONDS` (default `15`)
- `MONITOR_RETENTION_INTERVAL_SECONDS` (default `3600`)

Example:

```bash
MONITOR_API_KEY=my-secret MONITOR_PORT=7410 npm run dev
```

## 10. API Key Behavior

When `MONITOR_API_KEY` is set:

- `/v1/health` remains open
- all other `/v1/*` routes require `x-api-key`

If auth is enabled, configure the UI API key using either:

- build-time: `VITE_MONITOR_API_KEY` in `monitor/ui/.env`
- runtime in browser: `localStorage.setItem("monitor_api_key", "YOUR_KEY")`

## 11. API Quick Reference

- `POST /v1/events`
- `POST /v1/events/batch`
- `GET /v1/health`
- `GET /v1/status/summary`
- `GET /v1/status/jobs`
- `GET /v1/status/jobs/:jobName`
- `GET /v1/alerts`
- `GET /v1/events`
- `POST /v1/alerts/:alertId/close`

## 12. Alert Lifecycle

- `FAILURE`: opens on failed run, closes after later successful run.
- `MISSED`: opens when a heartbeat is missed beyond grace, closes on next heartbeat.
- `RECOVERY`: opens on recovery, auto-closes on next heartbeat or by TTL fallback.

Any open alert can also be manually closed in the UI or via API.

## 13. End-to-End Smoke Test

1. Start monitor (`npm run dev` in `monitor/`).
2. Run one Chief job:

```bash
gulag-chief run --config chief/chief.yaml --job sample-etl-pipeline
```

3. Confirm events appear in `/events`.
4. Trigger a failing run and verify a `FAILURE` alert in `/alerts`.
5. Fix and rerun, then verify recovery and alert closure behavior.

## 14. Troubleshooting

- No telemetry in UI:
  - confirm monitor is running and reachable at configured `monitor.endpoint`
  - confirm `monitor.enabled: true` in `chief/chief.yaml`
  - inspect `chief/chief.log` for telemetry warnings
- Ingest 401 responses:
  - check `MONITOR_API_KEY` matches `monitor.api_key`
- UI not loading at `/`:
  - run `npm run ui:build` before `npm run start`

## 15. Related Docs

- API endpoint reference:
  - [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- Technical deep dive:
  - [`docs/MONITOR_TECHNICAL_GUIDE.md`](docs/MONITOR_TECHNICAL_GUIDE.md)
- Legacy monitor architecture/reference:
  - [`docs/MONITOR.md`](docs/MONITOR.md)
