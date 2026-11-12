import { Hono } from "hono";
import type { Db } from "@orrery/db";

export function createApp(deps: { db: Db }) {
  const app = new Hono();

  app.get("/health", async (c) => {
    try {
      await deps.db.query("SELECT 1");
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unavailable", reason: "database" }, 503);
    }
  });

  return app;
}
