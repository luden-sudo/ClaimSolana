import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Minimal JSON-RPC proxy so the RPC provider key (SOLANA_RPC_URL) stays on the server
 * and never reaches the browser. Only the methods the app needs are forwarded.
 */
const UPSTREAM = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const ALLOWED_METHODS = new Set([
  "getTokenAccountsByOwner",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSignatureStatuses",
  "sendTransaction",
]);

export const config = {
  api: { bodyParser: { sizeLimit: "64kb" } },
};

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const calls: RpcRequest[] = Array.isArray(req.body) ? req.body : [req.body];
  if (calls.length === 0 || calls.length > 10) {
    return res.status(400).json({ error: "Invalid batch size" });
  }
  const blocked = calls.find((c) => typeof c?.method !== "string" || !ALLOWED_METHODS.has(c.method));
  if (blocked) {
    return res.status(403).json({
      jsonrpc: "2.0",
      id: blocked?.id ?? null,
      error: { code: -32601, message: "Method not allowed by proxy" },
    });
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json").send(text);
  } catch {
    res.status(502).json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "RPC unavailable" } });
  }
}
