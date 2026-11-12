import { Keypair } from "@stellar/stellar-base";
import { describe, expect, it } from "vitest";
import { buildLoginMessage, nonceOf, signMessage, verifyMessage } from "../src/index.js";

// Test cases published in SEP-53 itself.
const SEED = "SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW";
const ADDRESS = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

describe("SEP-53 vectors", () => {
  it("matches the ASCII case, base64 and hex", () => {
    const b64 = "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==";
    const hex =
      "7cee5d6d885752104c85eea421dfdcb95abf01f1271d11c4bec3fcbd7874dccd6e2e98b97b8eb23b643cac4073bb77de5d07b0710139180ae9f3cbba78f2ba04";
    expect(verifyMessage(ADDRESS, "Hello, World!", b64)).toBe(true);
    expect(verifyMessage(ADDRESS, "Hello, World!", hex)).toBe(true);
    expect(signMessage(Keypair.fromSecret(SEED), "Hello, World!")).toBe(b64);
  });

  it("matches the Japanese case", () => {
    const b64 = "CDU265Xs8y3OWbB/56H9jPgUss5G9A0qFuTqH2zs2YDgTm+++dIfmAEceFqB7bhfN3am59lCtDXrCtwH2k1GBA==";
    expect(verifyMessage(ADDRESS, "こんにちは、世界！", b64)).toBe(true);
  });

  it("matches the binary case", () => {
    const msg = Buffer.from("2zZDP1sa1BVBfLP7TeeMk3sUbaxAkUhBhDiNdrksaFo=", "base64");
    const b64 = "VA1+7hefNwv2NKScH6n+Sljj15kLAge+M2wE7fzFOf+L0MMbssA1mwfJZRyyrhBORQRle10X1Dxpx+UOI4EbDQ==";
    expect(verifyMessage(ADDRESS, msg, b64)).toBe(true);
  });
});

describe("verifyMessage rejects", () => {
  const kp = Keypair.random();
  const sig = signMessage(kp, "sign me");

  it("a different message", () => expect(verifyMessage(kp.publicKey(), "sign me!", sig)).toBe(false));
  it("a different account", () => expect(verifyMessage(Keypair.random().publicKey(), "sign me", sig)).toBe(false));
  it("a malformed signature", () => expect(verifyMessage(kp.publicKey(), "sign me", "not-a-signature")).toBe(false));
  it("a malformed account", () => expect(verifyMessage("GNOTANACCOUNT", "sign me", sig)).toBe(false));
});

describe("login message", () => {
  it("round-trips the nonce", () => {
    const nonce = "a".repeat(64);
    const text = buildLoginMessage({
      domain: "app.orrery.test",
      account: ADDRESS,
      nonce,
      issuedAt: new Date("2026-11-12T00:00:00Z"),
      expiresAt: new Date("2026-11-12T00:05:00Z"),
    });
    expect(text.startsWith("app.orrery.test wants you to sign in")).toBe(true);
    expect(nonceOf(text)).toBe(nonce);
    expect(nonceOf("no nonce here")).toBeNull();
  });
});
