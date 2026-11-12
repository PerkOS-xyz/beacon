import type { Db } from "@orrery/db";
import { createMiddleware } from "hono/factory";
import type { Config } from "./config.js";
import type { UmamiAdmin } from "./umami.js";

export interface Deps {
  db: Db;
  config: Config;
  umami: UmamiAdmin;
  now?: () => Date;
}

export type AppEnv = {
  Variables: {
    deps: Required<Deps>;
    /** The signed-in Stellar account, or null. */
    account: string | null;
  };
};

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("account")) return c.json({ error: "unauthenticated" }, 401);
  await next();
});

export const requireOperator = createMiddleware<AppEnv>(async (c, next) => {
  const account = c.get("account");
  if (!account) return c.json({ error: "unauthenticated" }, 401);
  if (!c.get("deps").config.operators.has(account)) return c.json({ error: "forbidden" }, 403);
  await next();
});

/** Reads a JSON object body, or null when the body is missing or not an object. */
export async function jsonBody(req: { json(): Promise<unknown> }): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
