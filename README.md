<p align="center">
  <img src="brand/traffiq-logo-480.png" alt="Traffiq" width="240" />
</p>

Self-hosted dashboard for the HTTP traffic of a Dokploy server. It tails Traefik's JSON
access log, stores every request in SQLite and shows live KPIs, charts, failing/slow
endpoints, a world map of where visitors come from and a searchable request log.

IP geolocation by [DB-IP](https://db-ip.com) (City Lite, CC BY 4.0).

**Stack:** Bun · Hono · SQLite (Drizzle ORM) · React 19 + Vite · one process, one container.

Deployment on Dokploy: see [DEPLOY.md](DEPLOY.md).

## Development

```bash
bun install
bun run dev        # simulator + API (:3000) + Vite (:5173)
```

`bun run dev` starts `scripts/simulate.ts`, which writes realistic Traefik log lines to
`./data/access.log` (7 days of backfill on first run, then live traffic). Open
http://localhost:5173.

| Script | What it does |
| --- | --- |
| `bun run reset` | delete `./data` (database + simulated log) |
| `bun run build` | build the dashboard into `./dist` |
| `bun run start` | run the server (serves `./dist` when present) |
| `bun run db:generate` | generate a Drizzle migration after editing `server/schema.ts` |
| `bun run db:studio` | browse the database with Drizzle Studio |
| `bun run typecheck` | TypeScript check |

Migrations in `./drizzle` are applied automatically at startup.

## Configuration

| Variable | Default (production) | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ACCESS_LOG_PATH` | `/etc/dokploy/traefik/dynamic/access.log` | Traefik JSON access log |
| `DB_PATH` | `/data/traffiq.db` | SQLite database file |
| `AUTH_PASSWORD` | – | When set, the dashboard requires this password |
| `SESSION_SECRET` | `AUTH_PASSWORD` | Key used to sign session cookies |
| `SERVER_NAME` | `vps-01` | Name shown in the sidebar |
| `IGNORE_HOSTS` | – | Comma-separated hosts never recorded (e.g. the dashboard's own domain) |
| `GEOIP` | `true` | Geolocate visitors with DB-IP City Lite (`false` to turn off) |
| `GEOIP_PATH` | `/data/geo/dbip-city-lite.mmdb` | GeoIP database file |
| `GEOIP_AUTO_DOWNLOAD` | `true` | Download the database on first start and refresh it monthly |
| `BACKFILL_BYTES` | `67108864` | On first start, import only this many trailing bytes of the log |

## Layout

```
server/    collector (log tailing), parser, Drizzle schema, aggregations, Hono API
web/       React dashboard (design.css comes from the TrafficLens design in Claude Design)
shared/    types shared by API and UI
scripts/   Traefik log simulator for local development
drizzle/   SQL migrations
```
