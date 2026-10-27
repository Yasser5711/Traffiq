# syntax=docker/dockerfile:1

# --- build the dashboard -------------------------------------------------
FROM oven/bun:1.3.14-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# --- runtime -------------------------------------------------------------
FROM oven/bun:1.3.14-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/trafficlens.db \
    ACCESS_LOG_PATH=/traefik/access.log \
    STATIC_DIR=/app/dist

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun/install/cache
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
COPY --from=build /app/dist ./dist

VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Runs as root so it can read Traefik's access log, which is owned by root on the host.
# The log directory is mounted read-only (see docker-compose.yml).
CMD ["bun", "server/index.ts"]
