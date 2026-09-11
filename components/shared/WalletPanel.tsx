"use client";

import { useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";

export default function WalletPanel({ onClose }: { onClose: () => void }) {
  const {
    address, mode, connect, disconnect, connecting,
    exportGeneratedKey, importGeneratedKey, injectedAvailable,
  } = useWallet();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReveal = () => setRevealed(exportGeneratedKey());

  const handleCopy = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleImport = () => {
    setImportError(null);
    if (!importGeneratedKey(importValue.trim())) {
      setImportError("Not a valid private key. Expected a 0x-prefixed 64-character hex string.");
      return;
    }
    setImportValue("");
    setRevealed(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Wallet settings"
      className="absolute right-4 top-14 z-50 w-[360px] rounded-lg p-4 space-y-3"
      style={{ background: "var(--void-ink)", border: "1px solid var(--border)", boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>
          Wallet identity
        </p>
        <button onClick={onClose} aria-label="Close wallet panel" className="text-[13px]" style={{ color: "var(--muted-instrument)" }}>✕</button>
      </div>

      <div className="text-[13px] space-y-1">
        <p style={{ color: "var(--muted-instrument)" }}>Mode</p>
        <p className="font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          {mode === "injected" ? "Injected wallet (MetaMask / OKX)" : "Browser wallet (generated in this device)"}
        </p>
        <p style={{ fontFamily: "var(--font-data)", wordBreak: "break-all", color: "var(--signal-bone)" }}>{address}</p>
        <p style={{ color: "var(--muted-instrument)" }}>
          Reads and writes both use this address — it is the only identity Watchtower signs with.
        </p>
      </div>

      {mode === "generated" && (
        <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-[12.5px]" style={{ color: "var(--seismic-amber)" }}>
            This key lives only in this browser&apos;s local storage. Clearing site data or switching devices
            destroys it permanently. It is not custody-grade. Export it if you want to keep it.
          </p>
          {revealed ? (
            <div className="space-y-2">
              <textarea readOnly value={revealed} rows={2} className="w-full px-2 py-1.5 text-[12px]" style={{ fontFamily: "var(--font-data)", background: "var(--obs-ink,#0a0a0a)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
              <button onClick={handleCopy} className="btn-outline px-3 py-1 text-[13px]">{copied ? "Copied" : "Copy private key"}</button>
            </div>
          ) : (
            <button onClick={handleReveal} className="btn-outline px-3 py-1 text-[13px]">Reveal &amp; export private key</button>
          )}

          <div className="pt-2 space-y-1.5">
            <p className="text-[12.5px]" style={{ color: "var(--muted-instrument)" }}>Import a key on another device</p>
            <input
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              placeholder="0x…"
              className="w-full px-2 py-1.5 text-[12px]"
              style={{ fontFamily: "var(--font-data)", background: "var(--obs-ink,#0a0a0a)", border: "1px solid var(--border)", color: "var(--signal-bone)" }}
            />
            {importError && <p className="text-[12px]" style={{ color: "var(--pressure-red)" }}>{importError}</p>}
            <button onClick={handleImport} disabled={!importValue.trim()} className="btn-outline px-3 py-1 text-[13px] disabled:opacity-40">Import &amp; switch</button>
          </div>
        </div>
      )}

      <div className="pt-2 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
        {mode === "injected" ? (
          <button onClick={disconnect} className="btn-outline w-full py-1.5 text-[13px]">Disconnect injected wallet</button>
        ) : injectedAvailable ? (
          <button onClick={connect} disabled={connecting} className="btn-copper w-full py-1.5 text-[13px]">
            {connecting ? "Connecting…" : "Upgrade to injected wallet"}
          </button>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>
            Install MetaMask or OKX Wallet to connect an injected wallet instead.
          </p>
        )}
      </div>
    </div>
  );
}
