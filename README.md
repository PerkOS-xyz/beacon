# Orrery

Privacy-first, multi-tenant web and API analytics for projects building on Stellar.

Orrery is an open-source prototype for the Stellar Community Fund RFP "Web and API Analytics for Stellar Ecosystem Projects". It aims to give every Stellar project free analytics, and to give SCF one trusted, standardized source of real usage across the projects it funds.

> Work in progress. See [docs/architecture.md](docs/architecture.md) for the design and the current status.

## What it does

- **Web analytics** on [Umami](https://github.com/umami-software/umami), collected only from frontend code, with no client-side consent banner.
- **API analytics** through OpenTelemetry dual export. Tenants keep their own APM; Orrery keeps only standardized metrics (request counts, status codes, latency) in PostgreSQL.
- **Strict tenant isolation** with a global view for SCF operators.
- **Enrollment tied to Stellar**: a project proves control of its Stellar account with a SEP-53 signed message.

## Run it locally

Requirements: Docker with Compose v2.

```bash
cp deploy/.env.example deploy/.env
# Fill in POSTGRES_PASSWORD, UMAMI_APP_SECRET, UMAMI_TWO_FACTOR_KEY and ORRERY_SECRET_KEY
# (generate each with: openssl rand -hex 32). Put your own Stellar account in
# ORRERY_OPERATORS to get the SCF operator view.
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Caddy listens on port 8080 and routes by host name:

| URL | Service |
|---|---|
| http://app.localhost:8080 | Portal (from day 5); its API is under `/api` |
| http://app.localhost:8080/api/health | API health |
| http://analytics.localhost:8080 | Umami dashboard (operators only in production) |
| http://ingest.localhost:8080/health | Ingest service health |
| http://otlp.localhost:8080/v1/metrics | OTLP/HTTP metrics endpoint |

Umami creates a first user `admin` with password `umami`. Change it on first sign-in, then set the new one as `UMAMI_ADMIN_PASSWORD` so the API can create each tenant's Umami team.

Check a running stack end to end (two throwaway Stellar keys sign in, enroll and must not see each other):

```bash
npm ci && npm run build
node scripts/smoke-enroll.mjs http://app.localhost:8080
```

## Repository layout

| Path | Contents |
|---|---|
| `deploy/` | Compose stack, Caddyfile, PostgreSQL init |
| `collector/` | OpenTelemetry Collector configuration |
| `services/ingest/` | Ingest service: web gate, OTLP auth, metrics sink |
| `services/api/` | API: Stellar sign-in, tenants, dashboards, operator API |
| `packages/db/` | Database pool and SQL migrations shared by the services |
| `packages/stellar/` | SEP-53 signing and verification, sign-in messages |
| `scripts/` | Smoke tests for a running stack |
| `docs/` | Architecture and design notes |

## Development

This is an npm workspaces monorepo. From the repo root:

```bash
npm ci
npm run build       # tsc -b across packages and services
npm test            # vitest; database tests need TEST_DATABASE_URL
```

Database tests create and drop their own databases on the server in `TEST_DATABASE_URL`, for example a throwaway container:

```bash
docker run -d --name orrery-testdb -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17.11-alpine
TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/postgres npm test
```

## License

[MIT](LICENSE)
