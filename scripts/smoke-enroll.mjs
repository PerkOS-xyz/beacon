// Smoke test for a running stack: two throwaway Stellar keys sign in with
// SEP-53, enroll as tenants, and must not see each other.
// Usage: npm run build && node scripts/smoke-enroll.mjs http://app.localhost:8080
import { signMessage } from "@orrery/stellar";
import { Keypair } from "@stellar/stellar-base";

const origin = process.argv[2] ?? "http://app.localhost:8080";
const api = `${origin}/api`;

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.get("set-cookie") };
}

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function signIn(kp) {
  const challenge = await call("POST", "/auth/challenge", { body: { account: kp.publicKey() } });
  const verify = await call("POST", "/auth/verify", {
    body: { account: kp.publicKey(), message: challenge.body.message, signature: signMessage(kp, challenge.body.message) },
  });
  check(`sign-in ${kp.publicKey().slice(0, 8)}`, verify.status === 200, `HTTP ${verify.status}`);
  return verify.setCookie?.split(";")[0];
}

const alice = Keypair.random();
const bob = Keypair.random();
const aliceCookie = await signIn(alice);
const bobCookie = await signIn(bob);

const a = await call("POST", "/me/tenant", { body: { name: "Smoke Test Alpha" }, cookie: aliceCookie });
check("enroll alpha", a.status === 201, `HTTP ${a.status} ${a.body?.status ?? a.body?.error}`);
const b = await call("POST", "/me/tenant", { body: { name: "Smoke Test Beta" }, cookie: bobCookie });
check("enroll beta", b.status === 201, `HTTP ${b.status} ${b.body?.status ?? b.body?.error}`);

const again = await call("POST", "/me/tenant", { body: { name: "Twice" }, cookie: aliceCookie });
check("second enrollment refused", again.status === 409, `HTTP ${again.status}`);

const meA = await call("GET", "/me/tenant", { cookie: aliceCookie });
const meB = await call("GET", "/me/tenant", { cookie: bobCookie });
check("alpha sees only alpha", meA.body?.stellarAccount === alice.publicKey());
check("beta sees only beta", meB.body?.stellarAccount === bob.publicKey());

const ops = await call("GET", "/ops/tenants", { cookie: aliceCookie });
check("tenant cannot open the operator view", ops.status === 403, `HTTP ${ops.status}`);

const anon = await call("GET", "/me/tenant");
check("anonymous request refused", anon.status === 401, `HTTP ${anon.status}`);

const replayChallenge = await call("POST", "/auth/challenge", { body: { account: alice.publicKey() } });
const replayBody = {
  account: alice.publicKey(),
  message: replayChallenge.body.message,
  signature: signMessage(alice, replayChallenge.body.message),
};
await call("POST", "/auth/verify", { body: replayBody });
const replay = await call("POST", "/auth/verify", { body: replayBody });
check("signed message cannot be replayed", replay.status === 401, `HTTP ${replay.status}`);

console.log(JSON.stringify({ alpha: a.body, beta: b.body }, null, 2));
