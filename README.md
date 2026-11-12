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
# Fill in POSTGRES_PASSWORD, UMAMI_APP_SECRET and UMAMI_TWO_FACTOR_KEY
# (generate each with: openssl rand -hex 32)
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Caddy listens on port 8080 and routes by host name:

| URL | Service |
|---|---|
| http://analytics.localhost:8080 | Umami dashboard |
| http://ingest.localhost:8080/health | Ingest service health |
| http://otlp.localhost:8080/v1/metrics | OTLP/HTTP metrics endpoint |

Umami creates a first user `admin` with password `umami`. Change it on first sign-in.

## Repository layout

| Path | Contents |
|---|---|
| `deploy/` | Compose stack, Caddyfile, PostgreSQL init |
| `collector/` | OpenTelemetry Collector configuration |
| `services/ingest/` | Ingest service (TypeScript) |
| `docs/` | Architecture and design notes |

## Development

```bash
cd services/ingest
npm install
npm test
npm run typecheck
```

## License

[MIT](LICENSE)
