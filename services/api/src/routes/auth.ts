import { buildLoginMessage, isAccountId, nonceOf, verifyMessage } from "@orrery/stellar";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { type AppEnv, jsonBody } from "../http.js";
import { randomHex, randomToken, sha256Hex } from "../crypto.js";
import { findTenantByAccount, toPublicTenant } from "./tenants.js";

export const SESSION_COOKIE = "orrery_session";

export const authRoutes = new Hono<AppEnv>();

/** Step 1: the server issues a one-time message for the account to sign (SEP-53). */
authRoutes.post("/challenge", async (c) => {
  const { db, config, now } = c.get("deps");
  const body = await jsonBody(c.req);
  const account = body?.account;
  if (!isAccountId(account)) return c.json({ error: "invalid_account" }, 400);

  const issuedAt = now();
  const expiresAt = new Date(issuedAt.getTime() + config.challengeTtlMs);
  const nonce = randomHex(32);
  const message = buildLoginMessage({ domain: config.loginDomain, account, nonce, issuedAt, expiresAt });

  await db.query(
    "INSERT INTO auth_challenges (nonce, stellar_account, message, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [nonce, account, message, issuedAt, expiresAt],
  );
  return c.json({ message, expiresAt: expiresAt.toISOString() });
});

/** Step 2: the signed message comes back; a valid signature opens a session. */
authRoutes.post("/verify", async (c) => {
  const { db, config, now } = c.get("deps");
  const body = await jsonBody(c.req);
  const account = body?.account;
  const message = body?.message;
  const signature = body?.signature;
  if (!isAccountId(account) || typeof message !== "string" || typeof signature !== "string") {
    return c.json({ error: "invalid_request" }, 400);
  }

  const nonce = nonceOf(message);
  if (!nonce || !verifyMessage(account, message, signature)) return c.json({ error: "invalid_signature" }, 401);

  // Burn the challenge in one statement so a signature works exactly once.
  const at = now();
  const burned = await db.query(
    `UPDATE auth_challenges SET used_at = $4
      WHERE nonce = $1 AND stellar_account = $2 AND message = $3 AND used_at IS NULL AND expires_at > $4
      RETURNING nonce`,
    [nonce, account, message, at],
  );
  if (burned.rows.length === 0) return c.json({ error: "challenge_expired_or_used" }, 401);

  const token = randomToken(32);
  const expiresAt = new Date(at.getTime() + config.sessionTtlMs);
  await db.query(
    "INSERT INTO sessions (id_hash, stellar_account, created_at, expires_at) VALUES ($1, $2, $3, $4)",
    [sha256Hex(token), account, at, expiresAt],
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
  return c.json({ account, isOperator: config.operators.has(account) });
});

authRoutes.post("/logout", async (c) => {
  const { db, now } = c.get("deps");
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await db.query("UPDATE sessions SET revoked_at = $2 WHERE id_hash = $1 AND revoked_at IS NULL", [sha256Hex(token), now()]);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "unauthenticated" }, 401);
  const { db, config } = c.get("deps");
  const tenant = await findTenantByAccount(db, account);
  return c.json({
    account,
    isOperator: config.operators.has(account),
    tenant: tenant ? toPublicTenant(tenant) : null,
  });
});
