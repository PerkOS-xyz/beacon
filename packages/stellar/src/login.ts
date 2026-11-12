/**
 * The human-readable message a wallet shows when signing in to Orrery.
 * It names the domain so a signature cannot be replayed on another site,
 * and carries a one-time nonce and an expiry.
 */
export interface LoginMessage {
  domain: string;
  account: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

export function buildLoginMessage(m: LoginMessage): string {
  return [
    `${m.domain} wants you to sign in with your Stellar account:`,
    m.account,
    "",
    "Sign in to Orrery. This does not send a transaction or cost a fee.",
    "",
    `Nonce: ${m.nonce}`,
    `Issued At: ${m.issuedAt.toISOString()}`,
    `Expiration Time: ${m.expiresAt.toISOString()}`,
  ].join("\n");
}

/** Reads the nonce back out of a message built by buildLoginMessage. */
export function nonceOf(message: string): string | null {
  const match = /^Nonce: ([0-9a-f]{32,128})$/m.exec(message);
  return match ? match[1] : null;
}
