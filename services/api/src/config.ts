import { isAccountId } from "@orrery/stellar";

export interface Config {
  /** Origin the portal is served from, e.g. https://app.example.org. */
  appOrigin: string;
  /** Host named in sign-in messages so signatures cannot be replayed elsewhere. */
  loginDomain: string;
  /** Stellar accounts with the SCF operator role. */
  operators: Set<string>;
  /** 32-byte key that encrypts each tenant's Umami credentials at rest. */
  secretKey: Buffer;
  cookieSecure: boolean;
  challengeTtlMs: number;
  sessionTtlMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const appOrigin = required(env, "ORRERY_APP_ORIGIN");
  const url = new URL(appOrigin);
  if (url.origin !== appOrigin) throw new Error("ORRERY_APP_ORIGIN must be an origin with no path, like https://app.example.org");

  const secretHex = required(env, "ORRERY_SECRET_KEY");
  if (!/^[0-9a-f]{64}$/i.test(secretHex)) throw new Error("ORRERY_SECRET_KEY must be 32 bytes in hex (openssl rand -hex 32)");

  const operators = new Set(
    (env.ORRERY_OPERATORS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const account of operators) {
    if (!isAccountId(account)) throw new Error(`ORRERY_OPERATORS has an invalid Stellar account: ${account}`);
  }

  return {
    appOrigin,
    loginDomain: url.host,
    operators,
    secretKey: Buffer.from(secretHex, "hex"),
    cookieSecure: env.ORRERY_COOKIE_SECURE !== "false",
    challengeTtlMs: 5 * 60 * 1000,
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
