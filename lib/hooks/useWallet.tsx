"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { createWatchtowerClient, type WatchtowerClient } from "../genlayer/client";

interface WalletState {
  address: string | null;
  connected: boolean;
  client: WatchtowerClient | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  connected: false,
  client: null,
  connect: async () => {},
  disconnect: () => {},
});

const STORAGE_KEY = "watchtower_wallet_connected";

async function initClient(addr: string): Promise<WatchtowerClient> {
  const c = createWatchtowerClient(addr as `0x${string}`);
  try {
    await c.connect("studionet");
  } catch {
    // connect() may not exist or may fail on some versions — client still works for reads/writes
  }
  return c;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [client, setClient] = useState<WatchtowerClient | null>(null);

  const setupWallet = useCallback(async (addr: string) => {
    setAddress(addr);
    localStorage.setItem(STORAGE_KEY, "true");
    const c = await initClient(addr);
    setClient(c);
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined") return;
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("Please install MetaMask or another Web3 wallet");
      return;
    }
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        await setupWallet(accounts[0]);
      }
    } catch (e: any) {
      if (e?.code !== 4001) {
        console.error("Wallet connect failed:", e?.message || e);
      }
    }
  }, [setupWallet]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setClient(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Auto-reconnect on page load if previously connected
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as any).ethereum;
    if (!eth) return;
    const wasConnected = localStorage.getItem(STORAGE_KEY) === "true";
    if (!wasConnected) return;

    eth.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts.length > 0) {
        setupWallet(accounts[0]);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }).catch(() => {
      localStorage.removeItem(STORAGE_KEY);
    });
  }, [setupWallet]);

  // Listen for account changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as any).ethereum;
    if (!eth) return;

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (accounts[0] !== address) {
        setupWallet(accounts[0]);
      }
    };

    eth.on("accountsChanged", onAccountsChanged);
    return () => eth.removeListener("accountsChanged", onAccountsChanged);
  }, [address, disconnect, setupWallet]);

  return (
    <WalletContext.Provider value={{ address, connected: !!address, client, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
