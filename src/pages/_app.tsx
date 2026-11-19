import type { AppProps } from "next/app";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo } from "react";
import { rpcEndpoint } from "@/lib/config";
import "@solana/wallet-adapter-react-ui/styles.css";
import "@/styles/globals.css";

// Phantom, Solflare, Backpack and other modern wallets register themselves through the
// Wallet Standard, so no wallet-specific adapters are needed.
const wallets: never[] = [];

export default function App({ Component, pageProps }: AppProps) {
  const endpoint = useMemo(rpcEndpoint, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Component {...pageProps} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
