import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  APP_ORIGIN,
  createTestDb,
  fakeUmami,
  get,
  Keypair,
  post,
  signIn,
  signMessage,
  TEST_DATABASE_URL,
  testConfig,
} from "./helpers.js";

describe.skipIf(!TEST_DATABASE_URL)("Stellar sign-in (SEP-53)", () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;
  let clock = new Date("2026-11-12T12:00:00Z");
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ({ pool, drop } = await createTestDb());
    app = createApp({ db: pool, config: testConfig(), umami: fakeUmami().umami, now: () => clock });
  });
  afterAll(async () => drop());

  async function challengeFor(kp: Keypair) {
    const res = await post(app, "/auth/challenge", { account: kp.publicKey() });
    expect(res.status).toBe(200);
    return ((await res.json()) as { message: string }).message;
  }

  it("rejects a challenge for an invalid account", async () => {
    const res = await post(app, "/auth/challenge", { account: "GNOTREAL" });
    expect(res.status).toBe(400);
  });

  it("issues a message bound to the domain and the account", async () => {
    const kp = Keypair.random();
    const message = await challengeFor(kp);
    expect(message).toContain("app.orrery.test wants you to sign in");
    expect(message).toContain(kp.publicKey());
  });

  it("signs in with a valid signature and sets a secure session cookie", async () => {
    const kp = Keypair.random();
    const message = await challengeFor(kp);
    const res = await post(app, "/auth/verify", { account: kp.publicKey(), message, signature: signMessage(kp, message) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ account: kp.publicKey(), isOperator: false });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^orrery_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const me = await get(app, "/auth/me", cookie.split(";")[0]);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ account: kp.publicKey(), tenant: null });
  });

  it("stores only the hash of the session token", async () => {
    const kp = Keypair.random();
    const cookie = await signIn(app, kp);
    const token = cookie.split("=")[1];
    const { rows } = await pool.query("SELECT id_hash FROM sessions WHERE stellar_account = $1", [kp.publicKey()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id_hash).not.toBe(token);
    expect(rows[0].id_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to reuse a signed message", async () => {
    const kp = Keypair.random();
    const message = await challengeFor(kp);
    const body = { account: kp.publicKey(), message, signature: signMessage(kp, message) };
    expect((await post(app, "/auth/verify", body)).status).toBe(200);
    expect((await post(app, "/auth/verify", body)).status).toBe(401);
  });

  it("refuses a signature from another key", async () => {
    const kp = Keypair.random();
    const message = await challengeFor(kp);
    const res = await post(app, "/auth/verify", {
      account: kp.publicKey(),
      message,
      signature: signMessage(Keypair.random(), message),
    });
    expect(res.status).toBe(401);
  });

  it("refuses a message the server did not issue, even if correctly signed", async () => {
    const kp = Keypair.random();
    const forged = (await challengeFor(kp)).replace("Sign in to Orrery.", "Sign in to Orrery!");
    const res = await post(app, "/auth/verify", { account: kp.publicKey(), message: forged, signature: signMessage(kp, forged) });
    expect(res.status).toBe(401);
  });

  it("refuses a challenge issued for a different account", async () => {
    const victim = Keypair.random();
    const attacker = Keypair.random();
    const message = await challengeFor(victim);
    const res = await post(app, "/auth/verify", {
      account: attacker.publicKey(),
      message,
      signature: signMessage(attacker, message),
    });
    expect(res.status).toBe(401);
  });

  it("refuses an expired challenge", async () => {
    const kp = Keypair.random();
    const message = await challengeFor(kp);
    clock = new Date(clock.getTime() + 6 * 60 * 1000);
    const res = await post(app, "/auth/verify", { account: kp.publicKey(), message, signature: signMessage(kp, message) });
    expect(res.status).toBe(401);
  });

  it("logs out by revoking the session", async () => {
    const cookie = await signIn(app, Keypair.random());
    expect((await get(app, "/auth/me", cookie)).status).toBe(200);
    expect((await post(app, "/auth/logout", {}, cookie)).status).toBe(200);
    expect((await get(app, "/auth/me", cookie)).status).toBe(401);
  });

  it("blocks state-changing requests from another origin", async () => {
    const res = await app.request("/auth/challenge", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ account: Keypair.random().publicKey() }),
    });
    expect(res.status).toBe(403);
    expect(APP_ORIGIN).not.toBe("https://evil.example");
  });
});
