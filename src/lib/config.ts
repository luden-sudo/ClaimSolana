/**
 * The browser talks to Solana through the app's own /api/rpc proxy, which forwards to
 * SOLANA_RPC_URL on the server. That keeps your RPC provider key out of the client bundle.
 */
export function rpcEndpoint(): string {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return `${origin}/api/rpc`;
}

export const REPO_URL = "https://github.com/luden-sudo/ClaimSolana";
