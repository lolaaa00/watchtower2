"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { getContractSummary } from "@/lib/genlayer/reads";
import { env, getExplorerAddressUrl } from "@/lib/config/env";
import type { ContractSummary } from "@/lib/types";

export default function ChainLedgerPage() {
  const { client } = useWallet();
  const [summary, setSummary] = useState<ContractSummary | null>(null);

  useEffect(() => {
    if (!client) return;
    getContractSummary(client).then(setSummary).catch(() => {});
  }, [client]);

  return (
    <div className="p-5 animate-enter">
      <h1 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-heading)" }}>Chain Ledger</h1>
      <p className="text-[11px] mb-6" style={{ color: "var(--muted-instrument)" }}>
        On-chain audit trail. Every signal sweep has a chain stamp.
      </p>

      <div className="obs-field p-5 max-w-md space-y-2">
        <LedgerLine label="Network" value={`StudioNet (${env.chainId})`} />
        <LedgerLine label="RPC" value={env.rpcUrl} mono />
        {env.contractAddress && (
          <div className="flex justify-between text-[11px]">
            <span style={{ color: "var(--muted-instrument)" }}>Contract</span>
            <a href={getExplorerAddressUrl(env.contractAddress)} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ fontFamily: "var(--font-data)", color: "var(--authority-blue)" }}>
              {env.contractAddress.slice(0, 10)}…{env.contractAddress.slice(-8)}
            </a>
          </div>
        )}
        {summary && (
          <>
            <LedgerLine label="Deployer" value={`${summary.owner.slice(0, 10)}…${summary.owner.slice(-8)}`} mono />
            <div className="pt-2 mt-2" style={{ borderTop: "1px solid var(--border)" }} />
            <LedgerLine label="Authority Sources" value={String(summary.total_sources)} />
            <LedgerLine label="Exposure Maps" value={String(summary.total_profiles)} />
            <LedgerLine label="Signal Sweeps" value={String(summary.total_scans)} />
            <LedgerLine label="Impact Readings" value={String(summary.total_alerts)} />
            <LedgerLine label="Compliance Writs" value={String(summary.total_actions)} />
            <LedgerLine label="Second Readings" value={String(summary.total_reviews)} />
          </>
        )}
      </div>
    </div>
  );
}

function LedgerLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span style={{ color: "var(--muted-instrument)" }}>{label}</span>
      <span style={{ fontFamily: mono ? "var(--font-data)" : "var(--font-body)", color: "var(--faint-parchment)" }}>{value}</span>
    </div>
  );
}
