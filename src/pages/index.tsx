import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import type { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  BASE_FEE_LAMPORTS,
  CLOSES_PER_TX,
  buildCloseTransactions,
  scanWallet,
  sendAndConfirm,
  transactionCount,
  type ScanResult,
  type SendResult,
} from "@/lib/reclaim";
import {
  explorerUrl,
  formatSol,
  formatUsd,
  lamportsToSol,
  parsePublicKey,
  mintLabel,
  shortAddress,
} from "@/lib/format";
import { REPO_URL } from "@/lib/config";
import { Faq, HowItWorks, Logo } from "@/components/Sections";

// The wallet button reads browser-only state, so render it on the client.
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

type Status = "idle" | "scanning" | "ready" | "signing" | "sending" | "done" | "error";

const SITE_TITLE = "ClaimSolana · Reclaim SOL from empty token accounts";
const SITE_DESCRIPTION =
  "Close your empty Solana token accounts and get the rent back. Free, open source and non-custodial.";

export default function Home() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, signTransaction } = useWallet();

  const [previewInput, setPreviewInput] = useState("");
  const [previewKey, setPreviewKey] = useState<PublicKey | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SendResult[]>([]);
  const [recovered, setRecovered] = useState(0);
  const [solUsd, setSolUsd] = useState<number | null>(null);

  const target = publicKey ?? previewKey;
  const isPreview = !publicKey && !!previewKey;

  // Allow sharing a read-only preview: /?address=<wallet>
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.address;
    if (typeof q === "string") {
      setPreviewInput(q);
      setPreviewKey(parsePublicKey(q));
    }
  }, [router.isReady, router.query.address]);

  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
      .then((r) => r.json())
      .then((d) => setSolUsd(d?.solana?.usd ?? null))
      .catch(() => setSolUsd(null));
  }, []);

  const runScan = useCallback(
    async (owner: PublicKey) => {
      setStatus("scanning");
      setError(null);
      try {
        const result = await scanWallet(connection, owner);
        setScan(result);
        setSelected(new Set(result.closable.map((a) => a.address.toBase58())));
        setStatus("ready");
      } catch (err) {
        setScan(null);
        console.error(err);
        setError("Couldn't reach the Solana network. Please try again in a moment.");
        setStatus("error");
      }
    },
    [connection],
  );

  useEffect(() => {
    setResults([]);
    if (target) runScan(target);
    else {
      setScan(null);
      setStatus("idle");
    }
  }, [target, runScan]);

  const chosen = useMemo(
    () => scan?.closable.filter((a) => selected.has(a.address.toBase58())) ?? [],
    [scan, selected],
  );
  const reclaimLamports = chosen.reduce((sum, a) => sum + a.lamports, 0);
  const feeLamports = transactionCount(chosen.length) * BASE_FEE_LAMPORTS;
  const totalLamports = scan?.closable.reduce((sum, a) => sum + a.lamports, 0) ?? 0;
  const busy = status === "scanning" || status === "signing" || status === "sending";

  function toggle(address: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  }

  function toggleAll() {
    if (!scan) return;
    setSelected(
      selected.size === scan.closable.length
        ? new Set()
        : new Set(scan.closable.map((a) => a.address.toBase58())),
    );
  }

  function onPreview(e: FormEvent) {
    e.preventDefault();
    const key = parsePublicKey(previewInput);
    if (!key) {
      setError("That doesn't look like a Solana wallet address.");
      setStatus("error");
      return;
    }
    setPreviewKey(key);
    router.replace({ query: { address: key.toBase58() } }, undefined, { shallow: true });
  }

  async function claim() {
    if (!publicKey || chosen.length === 0) return;
    if (!signAllTransactions && !signTransaction) {
      setError("This wallet can't sign transactions.");
      setStatus("error");
      return;
    }
    setError(null);
    setResults([]);
    try {
      const blockhash = await connection.getLatestBlockhash("confirmed");
      const txs = buildCloseTransactions(publicKey, chosen, blockhash);

      setStatus("signing");
      let signed: VersionedTransaction[];
      if (signAllTransactions) signed = await signAllTransactions(txs);
      else {
        signed = [];
        for (const tx of txs) signed.push(await signTransaction!(tx));
      }

      setStatus("sending");
      const sent = await sendAndConfirm(connection, signed, blockhash);
      const got = sent.reduce((sum, r, i) => {
        if (!r.ok) return sum;
        const batch = chosen.slice(i * CLOSES_PER_TX, (i + 1) * CLOSES_PER_TX);
        return sum + batch.reduce((s, a) => s + a.lamports, 0);
      }, 0);
      setResults(sent);
      setRecovered(got);
      setStatus("done");
      const fresh = await scanWallet(connection, publicKey);
      setScan(fresh);
      setSelected(new Set(fresh.closable.map((a) => a.address.toBase58())));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(/reject|denied|cancel/i.test(message) ? "You cancelled the request." : message);
      setStatus("error");
    }
  }

  const usd = (lamports: number) =>
    solUsd ? formatUsd(lamportsToSol(lamports) * solUsd) : null;

  return (
    <>
      <Head>
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="page">
        <header className="topbar">
          <Link className="brand" href="/">
            <Logo />
            <span>ClaimSolana</span>
          </Link>
          <div className="topbar-actions">
            <a className="ghost-link" href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <WalletMultiButton />
          </div>
        </header>

        <main>
          <section className="hero">
            <p className="eyebrow">Solana rent reclaimer</p>
            <h1>
              Get back the SOL locked in your <span className="accent">empty token accounts</span>
            </h1>
            <p className="lede">
              Every token account in your wallet locks a small SOL rent deposit. Close the empty
              ones and that SOL goes straight back to you.
            </p>
            <ul className="pills">
              <li>0% fees</li>
              <li>Non-custodial</li>
              <li>Open source</li>
            </ul>
          </section>

          <section className="card" aria-live="polite">
            {!target && (
              <div className="empty">
                <h2>Connect your wallet to start</h2>
                <p className="muted">
                  Or paste any address to see how much SOL it could reclaim. Preview is read-only.
                </p>
                <form className="preview-form" onSubmit={onPreview}>
                  <input
                    value={previewInput}
                    onChange={(e) => setPreviewInput(e.target.value)}
                    placeholder="Wallet address"
                    spellCheck={false}
                    aria-label="Wallet address"
                  />
                  <button type="submit" className="btn secondary">
                    Preview
                  </button>
                </form>
                {status === "error" && error && <p className="error">{error}</p>}
              </div>
            )}

            {target && (
              <>
                <div className="card-head">
                  <div>
                    <p className="label">{isPreview ? "Previewing" : "Connected wallet"}</p>
                    <a
                      className="mono"
                      href={explorerUrl("account", target.toBase58())}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddress(target, 6)}
                    </a>
                  </div>
                  <button className="btn ghost" onClick={() => runScan(target)} disabled={busy}>
                    Rescan
                  </button>
                </div>

                <div className="stats">
                  <div className="stat highlight">
                    <p className="label">Reclaimable</p>
                    <p className="value">
                      {status === "scanning" ? <span className="skeleton" /> : scan ? `${formatSol(totalLamports)} SOL` : "—"}
                    </p>
                    <p className="sub">{scan && status !== "scanning" && usd(totalLamports)}</p>
                  </div>
                  <div className="stat">
                    <p className="label">Empty accounts</p>
                    <p className="value">
                      {status === "scanning" ? <span className="skeleton" /> : scan ? scan.closable.length : "—"}
                    </p>
                    <p className="sub">
                      {scan && scan.skipped.length > 0 && `${scan.skipped.length} can't be closed`}
                    </p>
                  </div>
                </div>

                {status === "done" && (
                  <div className={`notice ${results.every((r) => r.ok) ? "success" : "warn"}`}>
                    <strong>
                      {results.every((r) => r.ok)
                        ? `Done! ${formatSol(recovered)} SOL is back in your wallet.`
                        : `${results.filter((r) => r.ok).length} of ${results.length} transactions confirmed. ${formatSol(recovered)} SOL recovered.`}
                    </strong>
                    <ul>
                      {results.map((r, i) => (
                        <li key={r.signature || i}>
                          {r.signature ? (
                            <a href={explorerUrl("tx", r.signature)} target="_blank" rel="noreferrer">
                              {shortAddress(r.signature, 8)}
                            </a>
                          ) : (
                            "Not sent"
                          )}{" "}
                          {r.ok ? "✓" : `✗ ${r.error ?? ""}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {status === "error" && error && <p className="error">{error}</p>}

                {scan && scan.closable.length > 0 && (
                  <>
                    <div className="list-head">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={selected.size === scan.closable.length}
                          onChange={toggleAll}
                          disabled={busy}
                        />
                        Select all
                      </label>
                      <span className="muted">{chosen.length} selected</span>
                    </div>
                    <ul className="accounts">
                      {scan.closable.map((a) => {
                        const id = a.address.toBase58();
                        return (
                          <li key={id}>
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={selected.has(id)}
                                onChange={() => toggle(id)}
                                disabled={busy}
                              />
                              <span className="token">
                                {mintLabel(a.mint) && <strong>{mintLabel(a.mint)}</strong>}
                                <span className="mono muted">{shortAddress(a.mint, 4)}</span>
                              </span>
                            </label>
                            <span className={`tag ${a.program}`}>
                              {a.program === "token-2022" ? "Token-2022" : "SPL"}
                            </span>
                            <a
                              className="mono amount"
                              href={explorerUrl("account", id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              +{formatSol(a.lamports, 5)}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                {scan && scan.closable.length === 0 && status !== "scanning" && (
                  <p className="muted center">
                    No empty token accounts here. Nothing to reclaim right now.
                  </p>
                )}

                {scan && scan.skipped.length > 0 && (
                  <details className="skipped">
                    <summary>
                      {scan.skipped.length} empty account{scan.skipped.length === 1 ? "" : "s"} can&apos;t
                      be closed
                    </summary>
                    <ul>
                      {scan.skipped.map((s) => (
                        <li key={s.address.toBase58()}>
                          <span className="mono">{mintLabel(s.mint) ?? shortAddress(s.mint, 6)}</span>
                          <span className="muted">{s.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {scan && scan.closable.length > 0 && (
                  <div className="claim">
                    <dl className="summary">
                      <div>
                        <dt>You receive</dt>
                        <dd>{formatSol(reclaimLamports)} SOL</dd>
                      </div>
                      <div>
                        <dt>Network fee</dt>
                        <dd>
                          ~{formatSol(feeLamports, 6)} SOL · {transactionCount(chosen.length)} tx
                        </dd>
                      </div>
                      <div>
                        <dt>Service fee</dt>
                        <dd>0 SOL</dd>
                      </div>
                    </dl>
                    {isPreview ? (
                      <p className="muted center">Connect this wallet to claim.</p>
                    ) : (
                      <button
                        className="btn primary"
                        onClick={claim}
                        disabled={busy || chosen.length === 0}
                      >
                        {status === "signing"
                          ? "Approve in your wallet…"
                          : status === "sending"
                            ? "Confirming on-chain…"
                            : `Claim ${formatSol(reclaimLamports)} SOL`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          <HowItWorks />
          <Faq />
        </main>

        <footer className="footer">
          <p>
            Open source under the MIT license ·{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              View the code
            </a>
          </p>
          <p className="muted">Not affiliated with the Solana Foundation. Use at your own risk.</p>
        </footer>
      </div>
    </>
  );
}
