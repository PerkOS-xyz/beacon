import { createHash } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-base";

// SEP-53: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md
const PREFIX = Buffer.from("Stellar Signed Message:\n", "utf8");

/** SHA256(prefix + message), the 32 bytes a SEP-53 signature covers. */
export function messageHash(message: string | Uint8Array): Buffer {
  const body = typeof message === "string" ? Buffer.from(message, "utf8") : Buffer.from(message);
  return createHash("sha256").update(Buffer.concat([PREFIX, body])).digest();
}

/** True for a valid Stellar account ID (a G... ed25519 public key). */
export function isAccountId(value: unknown): value is string {
  return typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
}

/** Wallets return the 64-byte signature as base64 or hex; accept both. */
export function decodeSignature(signature: string): Buffer | null {
  const trimmed = signature.trim();
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  if (/^[A-Za-z0-9+/]{86}==$/.test(trimmed)) return Buffer.from(trimmed, "base64");
  return null;
}

export function verifyMessage(account: string, message: string | Uint8Array, signature: string): boolean {
  if (!isAccountId(account)) return false;
  const sig = decodeSignature(signature);
  if (!sig || sig.length !== 64) return false;
  try {
    return Keypair.fromPublicKey(account).verify(messageHash(message), sig);
  } catch {
    return false;
  }
}

/** Signs like a SEP-53 wallet does. Used by tests and local tooling, never with real keys on a server. */
export function signMessage(keypair: Keypair, message: string | Uint8Array): string {
  return keypair.sign(messageHash(message)).toString("base64");
}
