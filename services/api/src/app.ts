import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { sha256Hex } from "./crypto.js";
import type { AppEnv, Deps } from "./http.js";
import { authRoutes, SESSION_COOKIE } from "./routes/auth.js";
import { opsRoutes } from "./routes/ops.js";
import { tenantRoutes } from "./routes/tenants.js";

export function createApp(input: Deps) {
  const deps: Required<Deps> = { now: () => new Date(), ...input };
  const app = new Hono<AppEnv>();

  app.use(async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  // Browsers always send Origin on POST/PUT/DELETE. A mismatch means another
  // site is trying to act with the visitor's cookie.
  app.use(async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin && origin !== deps.config.appOrigin) return c.json({ error: "bad_origin" }, 403);
    }
    await next();
  });

  app.use(async (c, next) => {
    c.set("account", null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const { rows } = await deps.db.query<{ stellar_account: string }>(
        "SELECT stellar_account FROM sessions WHERE id_hash = $1 AND revoked_at IS NULL AND expires_at > $2",
        [sha256Hex(token), deps.now()],
      );
      if (rows[0]) c.set("account", rows[0].stellar_account);
    }
    await next();
  });

  app.get("/health", async (c) => {
    try {
      await deps.db.query("SELECT 1");
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unavailable", reason: "database" }, 503);
    }
  });

  app.route("/auth", authRoutes);
  app.route("/me", tenantRoutes);
  app.route("/ops", opsRoutes);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}

export type { AppEnv, Deps } from "./http.js";
