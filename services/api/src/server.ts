import { serve } from "@hono/node-server";
import { createPool, migrate } from "@orrery/db";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createUmamiAdmin } from "./umami.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const config = loadConfig(process.env);
const port = Number(process.env.PORT ?? 8080);

const pool = createPool(databaseUrl);
const applied = await migrate(pool);
console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database schema is up to date");

const umami = createUmamiAdmin({
  baseUrl: process.env.UMAMI_URL ?? "http://umami:3000",
  username: process.env.UMAMI_ADMIN_USER ?? "admin",
  password: process.env.UMAMI_ADMIN_PASSWORD ?? "",
});

const app = createApp({ db: pool, config, umami });
const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Orrery API listening on ${info.port} for ${config.appOrigin} (${config.operators.size} operator accounts)`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void pool.end().finally(() => process.exit(0));
  });
}
