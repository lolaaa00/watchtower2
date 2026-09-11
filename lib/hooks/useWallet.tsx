"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { EthereumProvider } from "../genlayer/client";

type WatchtowerClient = ReturnType<typeof createClient>;

export type WalletMode = "generated" | "injected";

interface WalletState {
  address: string | null;
  connected: boolean;
  client: WatchtowerClient | null;
  connecting: boolean;
  mode: WalletMode | null;
  ready: boolean;
  /** Generated-wallet only: acknowledgement gate for the browser-key warning. */
  needsAcknowledgement: boolean;
  acknowledgeGeneratedWallet: () => void;
  /** Connects an injected wallet (MetaMask/OKX/etc). Replaces the active identity. */
  connect: () => Promise<void>;
  /** Drops the injected wallet and returns to the persisted (or a fresh) generated wallet. */
  disconnect: () => void;
  /** Reveals the generated wallet's private key so the user can back it up. Never called for injected mode. */
  exportGeneratedKey: () => string | null;
  /** Replaces the generated wallet with one derived from an imported private key. */
  importGeneratedKey: (pk: string) => boolean;
  /** True once an EIP-1193 provider was detected in this browser (whether or not the user has connected it). */
  injectedAvailable: boolean;
}

const WalletContext = createContext<WalletState>({
  address: null,
  connected: false,
  client: null,
  connecting: false,
  mode: null,
  ready: false,
  needsAcknowledgement: false,
  acknowledgeGeneratedWallet: () => {},
  connect: async () => {},
  disconnect: () => {},
  exportGeneratedKey: () => null,
  importGeneratedKey: () => false,
  injectedAvailable: false,
});

const MODE_KEY = "watchtower_wallet_mode";
const GENERATED_PK_KEY = "watchtower_generated_pk";
const GENERATED_ACK_KEY = "watchtower_generated_wallet_ack";
const INJECTED_CONNECTED_KEY = "watchtower_wallet_connected";

function getInjectedProvider(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as any;
  return (w.ethereum || w.okxwallet) as EthereumProvider | undefined;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [client, setClient] = useState<WatchtowerClient | null>(null);
  const [mode, setMode] = useState<WalletMode | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsAcknowledgement, setNeedsAcknowledgement] = useState(false);
  const [injectedAvailable] = useState(() => !!getInjectedProvider());

  const buildInjectedClient = useCallback((addr: string, provider: EthereumProvider) => {
    const c = createClient({
      chain: studionet,
      account: addr as `0x${string}`,
      provider: provider as any,
    });
    setAddress(addr);
    setClient(c);
    setMode("injected");
    setNeedsAcknowledgement(false);
    localStorage.setItem(MODE_KEY, "injected");
    localStorage.setItem(INJECTED_CONNECTED_KEY, "true");
    return c;
  }, []);

  const buildGeneratedClient = useCallback((pk: `0x${string}`) => {
    const account = createAccount(pk);
    const c = createClient({ chain: studionet, account });
    setAddress(account.address);
    setClient(c);
    setMode("generated");
    localStorage.setItem(GENERATED_PK_KEY, pk);
    localStorage.setItem(MODE_KEY, "generated");
    setNeedsAcknowledgement(localStorage.getItem(GENERATED_ACK_KEY) !== "true");
    return c;
  }, []);

  const ensureGeneratedWallet = useCallback(() => {
    let pk = localStorage.getItem(GENERATED_PK_KEY) as `0x${string}` | null;
    if (!pk) {
      pk = generatePrivateKey();
    }
    return buildGeneratedClient(pk);
  }, [buildGeneratedClient]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined") return;
    const eth = getInjectedProvider();
    if (!eth) {
      alert("No wallet extension detected. You can keep using Watchtower with your browser wallet, or install MetaMask / OKX Wallet to connect one.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];

      const chainIdHex = `0x${studionet.id.toString(16)}`;
      const currentChainId = (await eth.request({ method: "eth_chainId" })) as string;
      if (currentChainId !== chainIdHex) {
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainIdHex }],
          });
        } catch (switchErr: any) {
          if (switchErr?.code === 4902) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: chainIdHex,
                chainName: studionet.name,
                rpcUrls: studionet.rpcUrls.default.http,
                nativeCurrency: studionet.nativeCurrency,
                blockExplorerUrls: [studionet.blockExplorers?.default.url],
              }],
            });
          } else {
            throw switchErr;
          }
        }
      }

      if (!accounts || accounts.length === 0) {
        setConnecting(false);
        return;
      }

      buildInjectedClient(accounts[0], eth);
    } catch (e: any) {
      if (e?.code !== 4001) {
        console.error("Wallet connect failed:", e?.message || e);
      }
    } finally {
      setConnecting(false);
    }
  }, [buildInjectedClient]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(INJECTED_CONNECTED_KEY);
    // Dropping an injected wallet falls back to the persisted browser wallet,
    // never to a signed-out state — reads/writes must always have one identity.
    ensureGeneratedWallet();
  }, [ensureGeneratedWallet]);

  const acknowledgeGeneratedWallet = useCallback(() => {
    localStorage.setItem(GENERATED_ACK_KEY, "true");
    setNeedsAcknowledgement(false);
  }, []);

  const exportGeneratedKey = useCallback((): string | null => {
    if (mode !== "generated") return null;
    return localStorage.getItem(GENERATED_PK_KEY);
  }, [mode]);

  const importGeneratedKey = useCallback((pk: string): boolean => {
    const trimmed = pk.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return false;
    try {
      buildGeneratedClient(trimmed as `0x${string}`);
      localStorage.setItem(GENERATED_ACK_KEY, "true");
      return true;
    } catch {
      return false;
    }
  }, [buildGeneratedClient]);

  // Bootstrap on mount: prefer a previously-connected injected wallet (silent,
  // no popup); otherwise fall back to the persisted or freshly generated browser
  // wallet so the app is usable with zero friction and no wallet extension.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = getInjectedProvider();

    const wasInjected = localStorage.getItem(INJECTED_CONNECTED_KEY) === "true";
    if (eth && wasInjected) {
      (eth.request({ method: "eth_accounts" }) as Promise<string[]>)
        .then((accounts) => {
          if (accounts.length > 0) {
            buildInjectedClient(accounts[0], eth);
          } else {
            localStorage.removeItem(INJECTED_CONNECTED_KEY);
            ensureGeneratedWallet();
          }
        })
        .catch(() => {
          localStorage.removeItem(INJECTED_CONNECTED_KEY);
          ensureGeneratedWallet();
        })
        .finally(() => setReady(true));
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time wallet-identity bootstrap from browser storage, not a render-driven update
    ensureGeneratedWallet();
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for account changes on the injected provider.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = getInjectedProvider();
    if (!eth) return;

    const onAccountsChanged = (accounts: string[]) => {
      if (mode !== "injected") return;
      if (accounts.length === 0) {
        disconnect();
      } else if (accounts[0] !== address) {
        buildInjectedClient(accounts[0], eth);
      }
    };

    eth.on("accountsChanged", onAccountsChanged);
    return () => eth.removeListener("accountsChanged", onAccountsChanged);
  }, [address, mode, disconnect, buildInjectedClient]);

  return (
    <WalletContext.Provider
      value={{
        address,
        connected: !!address,
        client,
        connecting,
        mode,
        ready,
        needsAcknowledgement,
        acknowledgeGeneratedWallet,
        connect,
        disconnect,
        exportGeneratedKey,
        importGeneratedKey,
        injectedAvailable,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
