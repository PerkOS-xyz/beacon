import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { decrypt } from "../src/crypto.js";
import { createTestDb, fakeUmami, get, Keypair, post, signIn, TEST_DATABASE_URL, testConfig } from "./helpers.js";

describe.skipIf(!TEST_DATABASE_URL)("tenant enrollment and isolation", () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ pool, drop } = await createTestDb());
  });
  afterAll(async () => drop());
  beforeEach(async () => {
    await pool.query("TRUNCATE tenants, sessions, auth_challenges, audit_log");
    await pool.query("UPDATE settings SET value = 'open' WHERE key = 'enrollment_mode'");
  });

  it("requires a session", async () => {
    const app = createApp({ db: pool, config: testConfig(), umami: fakeUmami().umami });
    expect((await get(app, "/me/tenant")).status).toBe(401);
    expect((await post(app, "/me/tenant", { name: "Example Wallet" })).status).toBe(401);
  });

  it("enrolls a tenant with its own Umami team and view-only user", async () => {
    const fake = fakeUmami();
    const config = testConfig();
    const app = createApp({ db: pool, config, umami: fake.umami });
    const kp = Keypair.random();
    const cookie = await signIn(app, kp);

    const res = await post(app, "/me/tenant", { name: "Example Wallet" }, cookie);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: "Example Wallet", stellarAccount: kp.publicKey(), status: "active" });

    expect(fake.teams.size).toBe(1);
    expect(fake.users.size).toBe(1);
    expect(fake.members).toHaveLength(1);

    const { rows } = await pool.query("SELECT umami_team_id, umami_user_id, umami_password_enc FROM tenants");
    expect(rows[0].umami_team_id).toBe(fake.members[0].teamId);
    expect(rows[0].umami_user_id).toBe(fake.members[0].userId);
    // The Umami password is stored encrypted and decrypts with the configured key.
    expect(rows[0].umami_password_enc).toMatch(/^v1:/);
    expect(decrypt(rows[0].umami_password_enc, config.secretKey).length).toBeGreaterThan(20);

    const audit = await pool.query("SELECT action FROM audit_log");
    expect(audit.rows.map((r) => r.action)).toEqual(["tenant.enroll"]);
  });

  it("allows one tenant per account", async () => {
    const app = createApp({ db: pool, config: testConfig(), umami: fakeUmami().umami });
    const cookie = await signIn(app, Keypair.random());
    expect((await post(app, "/me/tenant", { name: "First" }, cookie)).status).toBe(201);
    expect((await post(app, "/me/tenant", { name: "Second" }, cookie)).status).toBe(409);
  });

  it("validates the project name", async () => {
    const app = createApp({ db: pool, config: testConfig(), umami: fakeUmami().umami });
    const cookie = await signIn(app, Keypair.random());
    expect((await post(app, "/me/tenant", { name: " " }, cookie)).status).toBe(400);
    expect((await post(app, "/me/tenant", { name: "x".repeat(81) }, cookie)).status).toBe(400);
  });

  it("keeps each tenant to its own data", async () => {
    const app = createApp({ db: pool, config: testConfig(), umami: fakeUmami().umami });
    const alice = Keypair.random();
    const bob = Keypair.random();
    const aliceCookie = await signIn(app, alice);
    const bobCookie = await signIn(app, bob);
    await post(app, "/me/tenant", { name: "Alice Pay" }, aliceCookie);
    await post(app, "/me/tenant", { name: "Bob Swap" }, bobCookie);

    const a = (await (await get(app, "/me/tenant", aliceCookie)).json()) as { name: string; stellarAccount: string };
    const b = (await (await get(app, "/me/tenant", bobCookie)).json()) as { name: string; stellarAccount: string };
    expect(a).toMatchObject({ name: "Alice Pay", stellarAccount: alice.publicKey() });
    expect(b).toMatchObject({ name: "Bob Swap", stellarAccount: bob.publicKey() });

    // A tenant cannot reach the operator's global view.
    expect((await get(app, "/ops/tenants", aliceCookie)).status).toBe(403);
  });

  it("gives operators the global view", async () => {
    const operator = Keypair.random();
    const app = createApp({
      db: pool,
      config: testConfig({ operators: new Set([operator.publicKey()]) }),
      umami: fakeUmami().umami,
    });
    for (const name of ["Alpha Anchor", "Beta DEX"]) {
      await post(app, "/me/tenant", { name }, await signIn(app, Keypair.random()));
    }
    const opCookie = await signIn(app, operator);
    const me = (await (await get(app, "/auth/me", opCookie)).json()) as { isOperator: boolean };
    expect(me.isOperator).toBe(true);

    const res = await get(app, "/ops/tenants", opCookie);
    expect(res.status).toBe(200);
    const { tenants } = (await res.json()) as { tenants: Array<{ name: string }> };
    expect(tenants.map((t) => t.name).sort()).toEqual(["Alpha Anchor", "Beta DEX"]);
  });

  it("puts new tenants in pending when enrollment needs approval", async () => {
    await pool.query("UPDATE settings SET value = 'approval' WHERE key = 'enrollment_mode'");
    const app = createApp({ db: pool, config: testConfig(), umami: fakeUmami().umami });
    const res = await post(app, "/me/tenant", { name: "Gamma Lend" }, await signIn(app, Keypair.random()));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "pending" });
  });

  it("undoes Umami provisioning when a step fails", async () => {
    const fake = fakeUmami({ failOn: "addTeamUser" });
    const app = createApp({ db: pool, config: testConfig(), umami: fake.umami });
    const res = await post(app, "/me/tenant", { name: "Delta Bridge" }, await signIn(app, Keypair.random()));
    expect(res.status).toBe(502);
    expect(fake.teams.size).toBe(0);
    expect(fake.users.size).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM tenants")).rows[0].n).toBe(0);
  });
});
