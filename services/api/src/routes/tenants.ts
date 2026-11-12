import type { Db } from "@orrery/db";
import { Hono } from "hono";
import { type AppEnv, jsonBody, requireSession } from "../http.js";
import { encrypt, randomHex, randomToken } from "../crypto.js";

export interface TenantRow {
  id: string;
  name: string;
  stellar_account: string;
  status: "pending" | "active" | "removed";
  created_at: Date;
}

export function toPublicTenant(t: TenantRow) {
  return {
    id: t.id,
    name: t.name,
    stellarAccount: t.stellar_account,
    status: t.status,
    createdAt: t.created_at.toISOString(),
  };
}

export async function findTenantByAccount(db: Db, account: string): Promise<TenantRow | null> {
  const { rows } = await db.query<TenantRow>(
    "SELECT id, name, stellar_account, status, created_at FROM tenants WHERE stellar_account = $1",
    [account],
  );
  return rows[0] ?? null;
}

export const tenantRoutes = new Hono<AppEnv>();
tenantRoutes.use(requireSession);

/** The signed-in account's own tenant. There is no route that takes another tenant's ID. */
tenantRoutes.get("/tenant", async (c) => {
  const tenant = await findTenantByAccount(c.get("deps").db, c.get("account")!);
  return tenant ? c.json(toPublicTenant(tenant)) : c.json({ error: "not_enrolled" }, 404);
});

/** Self-service enrollment: one tenant per Stellar account. */
tenantRoutes.post("/tenant", async (c) => {
  const { db, umami, config, now } = c.get("deps");
  const account = c.get("account")!;
  const body = await jsonBody(c.req);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) return c.json({ error: "invalid_name" }, 400);

  if (await findTenantByAccount(db, account)) return c.json({ error: "already_enrolled" }, 409);

  const mode = (await db.query<{ value: string }>("SELECT value FROM settings WHERE key = 'enrollment_mode'")).rows[0]?.value;
  const status = mode === "approval" ? "pending" : "active";

  // Provision the tenant's own Umami team and view-only user first; undo on any failure.
  let teamId: string | null = null;
  let userId: string | null = null;
  const password = randomToken(24);
  try {
    teamId = await umami.createTeam(name);
    userId = await umami.createUser(`t-${account.slice(1, 9).toLowerCase()}-${randomHex(3)}`, password);
    await umami.addTeamUser(teamId, userId);
  } catch (err) {
    console.error("Umami provisioning failed", err);
    await undoUmami(umami, teamId, userId);
    return c.json({ error: "provisioning_failed" }, 502);
  }

  const at = now();
  const { rows } = await db.query<TenantRow>(
    `INSERT INTO tenants (name, stellar_account, status, umami_team_id, umami_user_id, umami_password_enc, created_at, approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (stellar_account) DO NOTHING
     RETURNING id, name, stellar_account, status, created_at`,
    [name, account, status, teamId, userId, encrypt(password, config.secretKey), at, status === "active" ? at : null],
  );
  if (!rows[0]) {
    // Lost a race with a parallel enrollment for the same account.
    await undoUmami(umami, teamId, userId);
    return c.json({ error: "already_enrolled" }, 409);
  }

  await db.query("INSERT INTO audit_log (actor, action, target, details, at) VALUES ($1, 'tenant.enroll', $2, $3, $4)", [
    account,
    rows[0].id,
    JSON.stringify({ status }),
    at,
  ]);
  return c.json(toPublicTenant(rows[0]), 201);
});

async function undoUmami(umami: AppEnv["Variables"]["deps"]["umami"], teamId: string | null, userId: string | null) {
  if (userId) await umami.deleteUser(userId).catch((e) => console.error("Umami cleanup (user) failed", e));
  if (teamId) await umami.deleteTeam(teamId).catch((e) => console.error("Umami cleanup (team) failed", e));
}
