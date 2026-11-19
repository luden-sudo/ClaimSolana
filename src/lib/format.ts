import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function formatSol(lamports: number, digits = 4): string {
  return lamportsToSol(lamports).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function shortAddress(key: PublicKey | string, chars = 4): string {
  const s = typeof key === "string" ? key : key.toBase58();
  return `${s.slice(0, chars)}…${s.slice(-chars)}`;
}

export function explorerUrl(kind: "tx" | "account" | "token", value: string): string {
  return `https://solscan.io/${kind}/${value}`;
}

export function parsePublicKey(value: string): PublicKey | null {
  try {
    const key = new PublicKey(value.trim());
    return PublicKey.isOnCurve(key.toBytes()) ? key : null;
  } catch {
    return null;
  }
}

/** Labels for a few well-known mints. Anything else is shown by its address. */
const KNOWN_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  So11111111111111111111111111111111111111112: "Wrapped SOL",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: "WIF",
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: "PYTH",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": "POPCAT",
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: "RENDER",
  HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC: "ai16z",
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: "JTO",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": "JLP",
  ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx: "ATLAS",
};

export function mintLabel(mint: PublicKey): string | null {
  return KNOWN_MINTS[mint.toBase58()] ?? null;
}
