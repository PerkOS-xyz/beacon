import { Hono } from "hono";
import { type AppEnv, requireOperator } from "../http.js";
import { type TenantRow, toPublicTenant } from "./tenants.js";

/** Routes for designated SCF operators: the global view across every tenant. */
export const opsRoutes = new Hono<AppEnv>();
opsRoutes.use(requireOperator);

opsRoutes.get("/tenants", async (c) => {
  const { rows } = await c
    .get("deps")
    .db.query<TenantRow>("SELECT id, name, stellar_account, status, created_at FROM tenants ORDER BY created_at DESC");
  return c.json({ tenants: rows.map(toPublicTenant) });
});
