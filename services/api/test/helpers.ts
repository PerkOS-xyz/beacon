import { randomBytes } from "node:crypto";
import { createPool, migrate } from "@orrery/db";
import { signMessage } from "@orrery/stellar";
import { Keypair } from "@stellar/stellar-base";
import type pg from "pg";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { UmamiAdmin } from "../src/umami.js";

/** Admin connection string for a Postgres the tests may create databases on. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const APP_ORIGIN = "http://app.orrery.test";

/** Creates a fresh, migrated database for one test file. */
export async function createTestDb(): Promise<{ pool: pg.Pool; drop: () => Promise<void> }> {
  const name = `orrery_test_${randomBytes(6).toString("hex")}`;
  const admin = createPool(TEST_DATABASE_URL!);
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString());
  await migrate(pool);
  return {
    pool,
    drop: async () => {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

/** In-memory stand-in for Umami that records what was provisioned. */
export function fakeUmami(opts: { failOn?: keyof UmamiAdmin } = {}) {
  const teams = new Map<string, string>();
  const users = new Map<string, string>();
  const members: Array<{ teamId: string; userId: string }> = [];
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const maybeFail = (op: keyof UmamiAdmin) => {
    if (opts.failOn === op) throw new Error(`fake ${op} failure`);
  };
  const umami: UmamiAdmin = {
    async createTeam(name) {
      maybeFail("createTeam");
      const t = id();
      teams.set(t, name);
      return t;
    },
    async createUser(username) {
      maybeFail("createUser");
      const u = id();
      users.set(u, username);
      return u;
    },
    async addTeamUser(teamId, userId) {
      maybeFail("addTeamUser");
      members.push({ teamId, userId });
    },
    async deleteTeam(teamId) {
      teams.delete(teamId);
    },
    async deleteUser(userId) {
      users.delete(userId);
    },
  };
  return { umami, teams, users, members };
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    appOrigin: APP_ORIGIN,
    loginDomain: new URL(APP_ORIGIN).host,
    operators: new Set(),
    secretKey: randomBytes(32),
    cookieSecure: true,
    challengeTtlMs: 5 * 60 * 1000,
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

export type TestApp = ReturnType<typeof createApp>;

export function post(app: TestApp, path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP_ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

export function get(app: TestApp, path: string, cookie?: string) {
  return app.request(path, { headers: cookie ? { cookie } : {} });
}

/** Runs the full SEP-53 sign-in for a keypair and returns the session cookie. */
export async function signIn(app: TestApp, kp: Keypair): Promise<string> {
  const challenge = await post(app, "/auth/challenge", { account: kp.publicKey() });
  const { message } = (await challenge.json()) as { message: string };
  const res = await post(app, "/auth/verify", {
    account: kp.publicKey(),
    message,
    signature: signMessage(kp, message),
  });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0];
}

export { Keypair, signMessage };
