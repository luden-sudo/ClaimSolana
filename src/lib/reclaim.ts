import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
} from "@solana/spl-token";

/** Close instructions per transaction. Keeps every tx well under the 1232-byte limit. */
export const CLOSES_PER_TX = 20;

/** Base fee Solana charges per signature, in lamports. */
export const BASE_FEE_LAMPORTS = 5_000;

export type TokenProgram = "spl-token" | "token-2022";

export interface ClosableAccount {
  address: PublicKey;
  mint: PublicKey;
  program: TokenProgram;
  /** Rent held by the account, returned to the owner when it is closed. */
  lamports: number;
}

export interface SkippedAccount {
  address: PublicKey;
  mint: PublicKey;
  reason: string;
}

export interface ScanResult {
  closable: ClosableAccount[];
  skipped: SkippedAccount[];
}

const PROGRAMS: { id: PublicKey; name: TokenProgram }[] = [
  { id: TOKEN_PROGRAM_ID, name: "spl-token" },
  { id: TOKEN_2022_PROGRAM_ID, name: "token-2022" },
];

/** Retries flaky RPC reads a few times with a short backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 600 * i));
    }
  }
}

function programId(program: TokenProgram): PublicKey {
  return program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

/**
 * Finds every token account owned by `owner` (SPL Token and Token-2022) that has a
 * zero balance and can be closed by the owner. Accounts that hold tokens are never
 * returned, so closing them can never destroy anything of value.
 */
export async function scanWallet(connection: Connection, owner: PublicKey): Promise<ScanResult> {
  const closable: ClosableAccount[] = [];
  const skipped: SkippedAccount[] = [];

  const responses = await Promise.all(
    PROGRAMS.map((p) =>
      withRetry(() => connection.getParsedTokenAccountsByOwner(owner, { programId: p.id })),
    ),
  );

  responses.forEach((response, i) => {
    const program = PROGRAMS[i].name;
    for (const { pubkey, account } of response.value) {
      const info = account.data.parsed?.info;
      if (!info || info.tokenAmount?.amount !== "0") continue;

      const mint = new PublicKey(info.mint);
      const base = { address: pubkey, mint };

      if (info.state === "frozen") {
        skipped.push({ ...base, reason: "Frozen by the token issuer" });
        continue;
      }
      if (info.closeAuthority && info.closeAuthority !== owner.toBase58()) {
        skipped.push({ ...base, reason: "Close authority is another wallet" });
        continue;
      }
      const withheld = (info.extensions ?? []).find(
        (e: { extension: string }) => e.extension === "transferFeeAmount",
      );
      if (withheld && Number(withheld.state?.withheldAmount ?? 0) > 0) {
        skipped.push({ ...base, reason: "Has withheld transfer fees" });
        continue;
      }

      closable.push({ ...base, program, lamports: account.lamports });
    }
  });

  closable.sort((a, b) => b.lamports - a.lamports);
  return { closable, skipped };
}

/** Splits the accounts into transactions that close them and send the rent back to `owner`. */
export function buildCloseTransactions(
  owner: PublicKey,
  accounts: ClosableAccount[],
  blockhash: BlockhashWithExpiryBlockHeight,
): VersionedTransaction[] {
  const transactions: VersionedTransaction[] = [];

  for (let i = 0; i < accounts.length; i += CLOSES_PER_TX) {
    const instructions = accounts
      .slice(i, i + CLOSES_PER_TX)
      .map((a) => createCloseAccountInstruction(a.address, owner, owner, [], programId(a.program)));

    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: blockhash.blockhash,
      instructions,
    }).compileToV0Message();

    transactions.push(new VersionedTransaction(message));
  }

  return transactions;
}

export function transactionCount(accounts: number): number {
  return Math.ceil(accounts / CLOSES_PER_TX);
}

export interface SendResult {
  signature: string;
  ok: boolean;
  error?: string;
}

/**
 * Sends signed transactions and polls until each one is confirmed or its blockhash expires.
 * Polling (instead of websocket subscriptions) works through the HTTP-only RPC proxy.
 */
export async function sendAndConfirm(
  connection: Connection,
  signed: VersionedTransaction[],
  blockhash: BlockhashWithExpiryBlockHeight,
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const tx of signed) {
    try {
      const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
      results.push({ signature, ok: false });
    } catch (err) {
      results.push({ signature: "", ok: false, error: errorMessage(err) });
    }
  }

  let pending = results.filter((r) => r.signature && !r.error);
  while (pending.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const { value } = await connection.getSignatureStatuses(pending.map((r) => r.signature));
    value.forEach((status, i) => {
      const r = pending[i];
      if (!status) return;
      if (status.err) r.error = JSON.stringify(status.err);
      else if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        r.ok = true;
      }
    });
    pending = pending.filter((r) => !r.ok && !r.error);
    if (pending.length && (await connection.getBlockHeight("confirmed")) > blockhash.lastValidBlockHeight) {
      for (const r of pending) r.error = "Expired before confirmation, please try again";
      pending = [];
    }
  }
  return results;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
