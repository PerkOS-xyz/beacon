import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createPool, migrate } from "./db.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8080);

const pool = createPool(databaseUrl);
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const applied = await migrate(pool, migrationsDir);
console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database schema is up to date");

const app = createApp({ db: pool });
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Orrery ingest listening on ${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void pool.end().finally(() => process.exit(0));
  });
}
