FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package*.json ./
COPY ui/package*.json ./ui/

RUN npm ci && npm --prefix ui ci

FROM deps AS build

WORKDIR /app

COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
COPY ui ./ui

RUN npm run ui:build && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV MONITOR_HOST=0.0.0.0
ENV MONITOR_PORT=7410
ENV MONITOR_DB_PATH=/data/monitor.sqlite

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/ui/dist ./ui/dist

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 7410

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:7410/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/server.js"]
