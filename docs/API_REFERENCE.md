# Gulag Monitor API Reference

This document is the in-depth reference for the Gulag Monitor HTTP API.

Base path:

- `/v1`

Default local base URL:

- `http://127.0.0.1:7410`

Technical internals (implementation details) are covered in [`MONITOR_TECHNICAL_GUIDE.md`](MONITOR_TECHNICAL_GUIDE.md).

## 1. Quick Start

Start monitor:

```bash
cd monitor
npm install
npm run db:migrate
MONITOR_AUTH_SECRET=replace-me \
MONITOR_AUTH_ADMIN_EMAIL=admin@example.com \
MONITOR_AUTH_ADMIN_PASSWORD=change-me-please \
npm run dev
```

Health check:

```bash
curl -s http://127.0.0.1:7410/v1/health
```

## 2. Authentication

Monitor uses hybrid auth:

- Better Auth session cookies for browser UI login (`/api/auth/*`)
- `x-api-key` for machine telemetry and compatibility access

`/v1` rules:

- `GET /v1/health` is always open.
- `POST /v1/events` and `POST /v1/events/batch`:
  - require `x-api-key` when `MONITOR_API_KEY` is set
  - remain open when `MONITOR_API_KEY` is empty
- all other `/v1/*` endpoints:
  - allow a valid Better Auth session cookie, or
  - allow a valid `x-api-key`

For Better Auth setup, generate and set `MONITOR_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Set it in monitor server environment and keep it stable across restarts.
For hosted deployments, set `MONITOR_AUTH_BASE_URL` to your public URL to avoid origin mismatches.

For machine ingest auth, you can generate `MONITOR_API_KEY` the same way:

```bash
openssl rand -base64 32
```

Use a different value than `MONITOR_AUTH_SECRET`.
If you use multiple UI domains, set `MONITOR_AUTH_TRUSTED_ORIGINS` as comma-separated origins.

Example:

```bash
curl -s http://127.0.0.1:7410/v1/status/summary \
  -H 'x-api-key: YOUR_KEY'
```

Unauthorized response:

```json
{
  "error": "Unauthorized"
}
```

## 3. Common API Behavior

- Content type: request/response JSON (`application/json`).
- Request body size limit: 2 MB.
- Timestamps are treated as strings; use ISO 8601 UTC (`2026-01-01T12:00:00Z`) for predictable filtering/sorting.
- Event and alert listing endpoints are newest-first (`eventAt`/`openedAt` descending).
- Pagination uses `limit` and `offset`.
  - `limit` default: `100`, max: `1000`
  - `offset` default: `0`, max: `1000000`
  - invalid values fall back to defaults (not validation errors)
- Most validation failures return `400` with:
  - `error`: message string
  - `details`: Zod validation details object

## 4. Data Types and Enums

Event payload enums:

- `sourceType`: `chief | worker | monitor`
- `level`: `DEBUG | INFO | WARN | ERROR | CRITICAL`

Derived status enums:

- check status: `UP | LATE | DOWN`
- alert type: `FAILURE | MISSED | RECOVERY`
- alert status: `OPEN | CLOSED`

## 5. Endpoint Reference

### 5.1 GET `/v1/health`

Purpose:

- liveness probe for monitor service

Auth:

- never requires API key

Response `200` example:

```json
{
  "ok": true,
  "service": "chief-monitor",
  "now": "2026-02-25T18:40:12.880Z",
  "dbPath": "./monitor.sqlite"
}
```

### 5.2 POST `/v1/events`

Purpose:

- ingest one telemetry event

Auth:

- requires `x-api-key` when `MONITOR_API_KEY` is configured

Body schema:

```json
{
  "sourceType": "chief",
  "eventType": "job.started",
  "level": "INFO",
  "message": "Job started",
  "eventAt": "2026-02-25T18:40:00Z",
  "jobName": "sample-etl-pipeline",
  "scriptPath": "workers/sample/extract_demo.py",
  "runId": "run-123",
  "scheduledFor": "2026-02-25T18:40:00Z",
  "success": true,
  "returnCode": 0,
  "durationMs": 450,
  "metadata": {
    "phase": "extract"
  }
}
```

Required fields:

- `sourceType`
- `eventType` (non-empty string)
- `level`
- `message` (non-empty string)

Success `202`:

```json
{
  "inserted": 1,
  "dropped": 0
}
```

Validation failure `400` example:

```json
{
  "error": "Invalid event payload",
  "details": {
    "fieldErrors": {
      "level": [
        "Invalid enum value. Expected 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'"
      ]
    },
    "formErrors": []
  }
}
```

Curl:

```bash
curl -s -X POST http://127.0.0.1:7410/v1/events \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "sourceType": "chief",
    "eventType": "job.started",
    "level": "INFO",
    "message": "Job started",
    "jobName": "sample-etl-pipeline",
    "runId": "run-123"
  }'
```

### 5.3 POST `/v1/events/batch`

Purpose:

- ingest multiple events in one call

Auth:

- requires `x-api-key` when `MONITOR_API_KEY` is configured

Accepted body forms:

1. Array form:

```json
[
  {
    "sourceType": "chief",
    "eventType": "job.started",
    "level": "INFO",
    "message": "Start",
    "jobName": "sample-etl-pipeline"
  },
  {
    "sourceType": "worker",
    "eventType": "worker.message",
    "level": "WARN",
    "message": "High latency",
    "jobName": "sample-etl-pipeline"
  }
]
```

2. Wrapped form:

```json
{
  "events": [
    {
      "sourceType": "chief",
      "eventType": "job.completed",
      "level": "INFO",
      "message": "Complete",
      "jobName": "sample-etl-pipeline",
      "success": true
    }
  ]
}
```

Success `202`:

```json
{
  "inserted": 2,
  "dropped": 0
}
```

Curl:

```bash
curl -s -X POST http://127.0.0.1:7410/v1/events/batch \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "events": [
      {
        "sourceType": "chief",
        "eventType": "job.started",
        "level": "INFO",
        "message": "Start",
        "jobName": "sample-etl-pipeline"
      },
      {
        "sourceType": "chief",
        "eventType": "job.completed",
        "level": "INFO",
        "message": "Complete",
        "jobName": "sample-etl-pipeline",
        "success": true
      }
    ]
  }'
```

### 5.4 GET `/v1/status/summary`

Purpose:

- compact dashboard-style summary of checks, active alerts, event totals, and Chief heartbeat status

Auth:

- requires Better Auth session cookie or valid `x-api-key`

Response `200` example:

```json
{
  "checks": [
    { "status": "UP", "count": 3 },
    { "status": "DOWN", "count": 1 }
  ],
  "activeAlerts": [
    { "alertType": "FAILURE", "count": 1 },
    { "alertType": "MISSED", "count": 1 }
  ],
  "totalEvents": 194,
  "latestEventAt": "2026-02-25T18:45:03.001Z",
  "chief": {
    "online": true,
    "lastHeartbeatAt": "2026-02-25T18:45:00.000Z",
    "pingIntervalSeconds": 15,
    "offlineAfterSeconds": 30
  }
}
```

Notes:

- `offlineAfterSeconds` is derived from heartbeat metadata (`ping_interval_seconds * 2`) with a minimum of 5s.
- If heartbeat metadata is missing, fallback is 45s.

### 5.5 GET `/v1/status/jobs`

Purpose:

- list check state for all monitored jobs plus each job's latest event

Auth:

- requires Better Auth session cookie or valid `x-api-key`

Response `200` example:

```json
{
  "jobs": [
    {
      "jobName": "sample-etl-pipeline",
      "enabled": true,
      "alertOnFailure": true,
      "alertOnMiss": true,
      "graceSeconds": 120,
      "status": "UP",
      "lastHeartbeatAt": "2026-02-25T18:40:04.000Z",
      "expectedNextAt": "2026-02-25T19:00:00.000Z",
      "lastSuccessAt": "2026-02-25T18:40:04.000Z",
      "lastFailureAt": null,
      "consecutiveFailures": 0,
      "updatedAt": "2026-02-25T18:40:04.012Z",
      "latestEvent": {
        "eventAt": "2026-02-25T18:40:04.000Z",
        "eventType": "job.completed",
        "level": "INFO",
        "message": "Job completed",
        "success": true
      }
    }
  ]
}
```

### 5.6 GET `/v1/status/jobs/:jobName`

Purpose:

- detailed view for one job: check state, last 100 events, open alerts

Auth:

- requires Better Auth session cookie or valid `x-api-key`

Path params:

- `jobName`: exact job name

Response `200` example:

```json
{
  "check": {
    "jobName": "sample-etl-pipeline",
    "enabled": true,
    "alertOnFailure": true,
    "alertOnMiss": true,
    "graceSeconds": 120,
    "status": "UP",
    "lastHeartbeatAt": "2026-02-25T18:40:04.000Z",
    "expectedNextAt": "2026-02-25T19:00:00.000Z",
    "lastSuccessAt": "2026-02-25T18:40:04.000Z",
    "lastFailureAt": null,
    "consecutiveFailures": 0,
    "updatedAt": "2026-02-25T18:40:04.012Z"
  },
  "events": [
    {
      "id": 933,
      "receivedAt": "2026-02-25T18:40:04.012Z",
      "eventAt": "2026-02-25T18:40:04.000Z",
      "sourceType": "chief",
      "eventType": "job.completed",
      "level": "INFO",
      "message": "Job completed",
      "jobName": "sample-etl-pipeline",
      "scriptPath": null,
      "runId": "run-123",
      "scheduledFor": "2026-02-25T18:40:00.000Z",
      "success": true,
      "returnCode": 0,
      "durationMs": 1220,
      "metadataJson": "{\"records\":100}",
      "metadata": {
        "records": 100
      }
    }
  ],
  "openAlerts": []
}
```

Not found `404`:

```json
{
  "error": "Job not found in check state",
  "jobName": "unknown-job"
}
```

### 5.7 GET `/v1/alerts`

Purpose:

- list alerts with optional filtering

Auth:

- requires Better Auth session cookie or valid `x-api-key`

Query params:

- `jobName` (exact match)
- `status` (commonly `OPEN` or `CLOSED`)
- `alertType` (`FAILURE | MISSED | RECOVERY`)
- `severity` (`INFO | WARN | ERROR | CRITICAL`)
- `limit` (default 100, max 1000)
- `offset` (default 0, max 1000000)

Response `200` example:

```json
{
  "alerts": [
    {
      "id": 88,
      "jobName": "sample-etl-pipeline",
      "alertType": "FAILURE",
      "severity": "ERROR",
      "status": "OPEN",
      "openedAt": "2026-02-25T18:41:00.000Z",
      "closedAt": null,
      "dedupeKey": "sample-etl-pipeline:FAILURE",
      "title": "Job sample-etl-pipeline failed",
      "detailsJson": "{\"eventType\":\"job.failed\",\"returnCode\":1,\"runId\":\"run-124\"}",
      "details": {
        "eventType": "job.failed",
        "returnCode": 1,
        "runId": "run-124"
      }
    }
  ],
  "limit": 100,
  "offset": 0
}
```

Curl:

```bash
curl -s 'http://127.0.0.1:7410/v1/alerts?status=OPEN&alertType=FAILURE&limit=50' \
  -H 'x-api-key: YOUR_KEY'
```

### 5.8 GET `/v1/events`

Purpose:

- query telemetry event stream with filters

Auth:

- requires Better Auth session cookie or valid `x-api-key`

Query params:

- `jobName` (exact match)
- `scriptPath` (exact match)
- `level` (`DEBUG|INFO|WARN|ERROR|CRITICAL`)
- `eventType` (exact match)
- `from` (inclusive lower bound on `eventAt`)
- `to` (inclusive upper bound on `eventAt`)
- `limit` (default 100, max 1000)
- `offset` (default 0, max 1000000)

Response `200` example:

```json
{
  "events": [
    {
      "id": 933,
      "receivedAt": "2026-02-25T18:40:04.012Z",
      "eventAt": "2026-02-25T18:40:04.000Z",
      "sourceType": "chief",
      "eventType": "job.completed",
      "level": "INFO",
      "message": "Job completed",
      "jobName": "sample-etl-pipeline",
      "scriptPath": null,
      "runId": "run-123",
      "scheduledFor": "2026-02-25T18:40:00.000Z",
      "success": true,
      "returnCode": 0,
      "durationMs": 1220,
      "metadataJson": "{\"records\":100}",
      "metadata": {
        "records": 100
      }
    }
  ],
  "limit": 100,
  "offset": 0
}
```

Curl:

```bash
curl -s 'http://127.0.0.1:7410/v1/events?jobName=sample-etl-pipeline&from=2026-02-25T00:00:00Z&to=2026-02-25T23:59:59Z&limit=100' \
  -H 'x-api-key: YOUR_KEY'
```

### 5.9 POST `/v1/alerts/:alertId/close`

Purpose:

- manually close an alert by id

Auth:

- requires Better Auth session cookie or valid `x-api-key`

Path params:

- `alertId`: positive integer

Body:

```json
{
  "reason": "manual"
}
```

`reason` is optional, trimmed, and max length 200. Default is `"manual"` if omitted.

Success `200` when alert was open and got closed:

```json
{
  "found": true,
  "updated": true,
  "reason": "manual",
  "alert": {
    "id": 88,
    "status": "CLOSED",
    "closedAt": "2026-02-25T18:52:10.304Z"
  }
}
```

Success `200` when alert already closed (idempotent behavior):

```json
{
  "found": true,
  "updated": false,
  "reason": "manual",
  "alert": {
    "id": 88,
    "status": "CLOSED",
    "closedAt": "2026-02-25T18:52:10.304Z"
  }
}
```

Bad id `400`:

```json
{
  "error": "alertId must be a positive integer"
}
```

Not found `404`:

```json
{
  "error": "Alert not found",
  "alertId": 99999
}
```

Curl:

```bash
curl -s -X POST http://127.0.0.1:7410/v1/alerts/88/close \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"reason":"resolved by on-call"}'
```

## 6. Operational Semantics You Should Know

### 6.1 Check and Alert Lifecycle

Monitor derives check and alert state from incoming events:

- Heartbeat-like events: `job.started`, `job.completed`, `job.failed`
  - update `lastHeartbeatAt`
  - set check status to `UP`
- If expected run time is exceeded beyond grace: check becomes `DOWN`, `MISSED` may open.
- `FAILURE` opens on failed job outcomes.
- `RECOVERY` can open when a missed or failure condition recovers.
- Recovery alerts are transient and auto-close on a later heartbeat or after TTL fallback.

### 6.2 Event Metadata That Affects Monitoring

Per-event metadata can influence check behavior:

- `check_enabled`
- `grace_seconds`
- `alert_on_failure`
- `alert_on_miss`

`job.next_scheduled` events with metadata key `next_run_at` update the check expected run timestamp.

### 6.3 Query Filtering Tips

- `alerts` and `events` filters are exact matches for string fields.
- Use ISO timestamps for `from`/`to`; filtering is string-based against stored timestamp text.
- The API does not return a total count for pagination; page until results are empty.

## 7. Integration Examples

### 7.1 Python (requests)

```python
import requests

BASE_URL = "http://127.0.0.1:7410/v1"
API_KEY = "YOUR_KEY"
HEADERS = {"x-api-key": API_KEY, "Content-Type": "application/json"}

event = {
    "sourceType": "worker",
    "eventType": "worker.message",
    "level": "INFO",
    "message": "Extract phase complete",
    "jobName": "sample-etl-pipeline",
    "metadata": {"rows": 1000},
}

r = requests.post(f"{BASE_URL}/events", json=event, headers=HEADERS, timeout=5)
r.raise_for_status()
print(r.json())

alerts = requests.get(f"{BASE_URL}/alerts", params={"status": "OPEN", "limit": 20}, headers=HEADERS, timeout=5)
alerts.raise_for_status()
print(alerts.json())
```

### 7.2 JavaScript (fetch)

```javascript
const baseUrl = "http://127.0.0.1:7410/v1";
const apiKey = "YOUR_KEY";

async function call(path, init = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    ...(init.headers || {}),
  };
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json();
}

await call("/events/batch", {
  method: "POST",
  body: JSON.stringify({
    events: [
      {
        sourceType: "chief",
        eventType: "job.started",
        level: "INFO",
        message: "Job started",
        jobName: "sample-etl-pipeline",
      },
    ],
  }),
});

const summary = await call("/status/summary");
console.log(summary);
```

## 8. Error Handling Checklist

- `401 Unauthorized`
  - missing/invalid Better Auth session cookie and missing/wrong `x-api-key`
  - for telemetry ingest endpoints (`/v1/events*`), missing/wrong `x-api-key` when key auth is enabled
- `400 Invalid event payload` or `400 Invalid batch payload`
  - enum mismatch, missing required field, wrong type
- `400 alertId must be a positive integer`
  - invalid path parameter for close endpoint
- `404 Alert not found`
  - close endpoint id does not exist
- `404 Job not found in check state`
  - no check state has been created for that job yet

## 9. See Also

- Practical monitor guide:
  - [`../README.md`](../README.md)
- Technical internals:
  - [`MONITOR_TECHNICAL_GUIDE.md`](MONITOR_TECHNICAL_GUIDE.md)
