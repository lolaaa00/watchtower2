"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { getContractSummary, getSources } from "@/lib/genlayer/reads";
import { registerSource } from "@/lib/genlayer/writes";
import { waitForTx } from "@/lib/genlayer/tx";
import { env, getExplorerAddressUrl } from "@/lib/config/env";
import TxHashRibbon from "@/components/shared/TxHashRibbon";
import type { TxState, SourceRecord } from "@/lib/types";

interface SourceTemplate {
  slug: string;
  display_name: string;
  authority: string;
  jurisdiction: string;
  sector: string;
  source_type: string;
  adapter: string;
  url: string;
  trust_level: string;
  scan_interval_seconds: number;
  description: string;
}

const TEMPLATES: SourceTemplate[] = [
  {
    slug: "cfpb-rules-notices",
    display_name: "CFPB — Consumer Financial Rules & Notices",
    authority: "CFPB",
    jurisdiction: "US",
    sector: "financial_services",
    source_type: "API",
    adapter: "FEDERAL_REGISTER_API",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=consumer-financial-protection-bureau&per_page=5&order=newest",
    trust_level: "OFFICIAL",
    scan_interval_seconds: 86400,
    description: "CFPB-only rules and notices via Federal Register API. Returns lending, disclosure, and consumer protection regulations directly relevant to fintechs.",
  },
  {
    slug: "federal-register-financial",
    display_name: "Federal Register — Financial Services",
    authority: "Federal Register",
    jurisdiction: "US",
    sector: "financial_services",
    source_type: "API",
    adapter: "FEDERAL_REGISTER_API",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=consumer-financial-protection-bureau&conditions%5Bagencies%5D%5B%5D=federal-reserve-system&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&conditions%5Btype%5D%5B%5D=NOTICE&per_page=5&order=newest",
    trust_level: "OFFICIAL",
    scan_interval_seconds: 86400,
    description: "Official US government API. Returns rules, proposed rules, and notices from CFPB and Federal Reserve. No API key required.",
  },
  {
    slug: "federal-reserve-press",
    display_name: "Federal Reserve — Press Releases",
    authority: "Federal Reserve",
    jurisdiction: "US",
    sector: "financial_services",
    source_type: "RSS",
    adapter: "FEDERAL_RESERVE_RSS",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    trust_level: "OFFICIAL",
    scan_interval_seconds: 86400,
    description: "Official Fed RSS feed. Supervisory guidance, enforcement, policy statements, rate decisions.",
  },
  {
    slug: "ecfr-title-12",
    display_name: "eCFR Title 12 — Banks and Banking",
    authority: "eCFR",
    jurisdiction: "US",
    sector: "financial_services",
    source_type: "API",
    adapter: "ECFR_API",
    url: "https://www.ecfr.gov/api/versioner/v1/titles?title=12",
    trust_level: "OFFICIAL",
    scan_interval_seconds: 172800,
    description: "Official electronic Code of Federal Regulations API. Amendment dates for Title 12 banking regulation.",
  },
  {
    slug: "sec-regulatory-rss",
    display_name: "SEC — Regulatory and Market Updates",
    authority: "SEC",
    jurisdiction: "US",
    sector: "financial_services",
    source_type: "RSS",
    adapter: "SEC_RSS",
    url: "https://www.sec.gov/news/pressreleases.rss",
    trust_level: "OFFICIAL",
    scan_interval_seconds: 43200,
    description: "Official SEC press releases RSS feed. Enforcement actions, regulatory releases, market updates.",
  },
];

export default function AuthorityControlPage() {
  const { connected, client, address } = useWallet();
  const [owner, setOwner] = useState<string | null>(null);
  const [registeredSources, setRegisteredSources] = useState<SourceRecord[]>([]);
  const [txStates, setTxStates] = useState<Record<string, TxState>>({});
  const [federalRegGreen, setFederalRegGreen] = useState(false);
  const [nowTs] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!client) return;
    getContractSummary(client).then((s) => setOwner(s.owner)).catch(() => {});
    getSources(client).then((s) => {
      setRegisteredSources(s);
      if (s.some((src) => src.authority === "Federal Register" || src.authority === "CFPB")) {
        setFederalRegGreen(true);
      }
    }).catch(() => {});
  }, [client]);

  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase();
  const ownerMatch = !address ? "unknown" : !owner ? "unknown" : isOwner ? "yes" : "no";

  const isRegistered = (template: SourceTemplate) =>
    registeredSources.some((s) => s.authority === template.authority && s.url === template.url);

  const handleRegister = async (template: SourceTemplate) => {
    if (!client) return;
    const key = template.slug;

    try {
      setTxStates((prev) => ({ ...prev, [key]: { status: "prompting" } }));

      const hash = await registerSource(client, {
        authority: template.authority,
        jurisdiction: template.jurisdiction,
        sector: template.sector,
        source_type: template.source_type,
        adapter: template.adapter,
        url: template.url,
        trust_level: template.trust_level,
        scan_interval_seconds: template.scan_interval_seconds,
        next_due_at: nowTs,
      });

      setTxStates((prev) => ({ ...prev, [key]: { status: "submitted", hash: hash as string } }));
      await waitForTx(client, hash as `0x${string}`);
      setTxStates((prev) => ({ ...prev, [key]: { status: "confirmed", hash: hash as string } }));

      // Refresh sources
      const updated = await getSources(client);
      setRegisteredSources(updated);
      if (template.slug === "federal-register-financial" || template.slug === "cfpb-rules-notices") {
        setFederalRegGreen(true);
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      let readable = msg;
      if (msg.includes("ONLY_OWNER")) readable = "Only the contract deployer can register source apertures.";
      else if (msg.includes("INVALID_SOURCE_URL")) readable = "Source URL is invalid or too short.";
      else if (msg.includes("user rejected")) readable = "Transaction rejected in wallet.";
      setTxStates((prev) => ({ ...prev, [key]: { status: "failed", error: readable } }));
    }
  };

  if (!connected) {
    return (
      <div className="p-5 animate-enter">
        <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-heading)" }}>Authority Control</h1>
        <p className="text-[11px] mt-2" style={{ color: "var(--muted-instrument)" }}>Connect wallet to manage source apertures.</p>
      </div>
    );
  }

  return (
    <div className="p-5 animate-enter">
      <h1 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-heading)" }}>Authority Control</h1>
      <p className="text-[11px] mb-6" style={{ color: "var(--muted-instrument)" }}>
        Open official source apertures so Watchtower can run real signal sweeps.
      </p>

      {/* Contract panel */}
      <div className="obs-field p-4 mb-6">
        <p className="text-[9px] font-bold uppercase tracking-[0.1em] mb-3" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>
          Contract Status
        </p>
        <div className="space-y-1.5">
          <InfoRow label="Contract" value={
            <a href={getExplorerAddressUrl(env.contractAddress)} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ fontFamily: "var(--font-data)", color: "var(--authority-blue)" }}>
              {env.contractAddress.slice(0, 12)}…{env.contractAddress.slice(-8)}
            </a>
          } />
          <InfoRow label="Network" value={<span style={{ fontFamily: "var(--font-data)" }}>StudioNet ({env.chainId})</span>} />
          <InfoRow label="Connected Wallet" value={<span style={{ fontFamily: "var(--font-data)" }}>{address?.slice(0, 10)}…{address?.slice(-6)}</span>} />
          <InfoRow label="Contract Owner" value={<span style={{ fontFamily: "var(--font-data)" }}>{owner ? `${owner.slice(0, 10)}…${owner.slice(-6)}` : "loading…"}</span>} />
          <InfoRow label="Owner Match" value={
            <span className="indicator" style={{
              background: ownerMatch === "yes" ? "rgba(89,209,140,0.1)" : ownerMatch === "no" ? "rgba(229,72,77,0.1)" : "rgba(116,123,132,0.1)",
              color: ownerMatch === "yes" ? "var(--exposure-green)" : ownerMatch === "no" ? "var(--pressure-red)" : "var(--muted-instrument)",
            }}>
              {ownerMatch.toUpperCase()}
            </span>
          } />
          <InfoRow label="Registered Sources" value={<span style={{ fontFamily: "var(--font-display-num)", color: "var(--seismic-amber)" }}>{registeredSources.length}</span>} />
        </div>
      </div>

      {/* Owner warning */}
      {ownerMatch === "no" && (
        <div className="obs-field p-4 mb-6" style={{ borderColor: "rgba(229,72,77,0.2)" }}>
          <p className="text-[11px]" style={{ color: "var(--pressure-red)" }}>
            You are not the contract deployer. Only the deployer can register official source apertures. The deployer wallet is {owner?.slice(0, 10)}…{owner?.slice(-6)}.
          </p>
        </div>
      )}

      {/* Source templates */}
      <div className="space-y-3">
        {TEMPLATES.map((t, i) => {
          const registered = isRegistered(t);
          const tx = txStates[t.slug] || { status: "idle" };
          const isPrimary = t.slug === "cfpb-rules-notices" || t.slug === "federal-register-financial";
          const canRegister = isPrimary || federalRegGreen;

          return (
            <div key={t.slug} className="obs-aperture p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold" style={{ fontFamily: "var(--font-display-num)", color: "var(--regulatory-copper)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-[13px] font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>
                      {t.display_name}
                    </h3>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: "var(--muted-instrument)" }}>{t.description}</p>
                </div>
                {registered && (
                  <span className="indicator" style={{ background: "rgba(89,209,140,0.1)", color: "var(--exposure-green)" }}>
                    REGISTERED
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-3">
                <DataRow label="Authority" value={t.authority} />
                <DataRow label="Jurisdiction" value={t.jurisdiction} />
                <DataRow label="Source Type" value={t.source_type} />
                <DataRow label="Adapter" value={t.adapter} />
                <DataRow label="Trust Level" value={t.trust_level} />
                <DataRow label="Sweep Interval" value={`${t.scan_interval_seconds / 3600}h`} />
              </div>

              <div className="mb-3">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>
                  Source URL
                </span>
                <p className="text-[9px] mt-0.5 break-all" style={{ fontFamily: "var(--font-data)", color: "var(--authority-blue)" }}>
                  {t.url}
                </p>
              </div>

              {!registered && (
                <>
                  {!canRegister && !isPrimary ? (
                    <p className="text-[10px]" style={{ color: "var(--muted-instrument)" }}>
                      Register after Federal Register is green.
                    </p>
                  ) : (
                    <button
                      onClick={() => handleRegister(t)}
                      disabled={tx.status === "prompting" || tx.status === "submitted"}
                      className="btn-copper px-4 py-1.5 text-[10px] w-full"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {tx.status === "prompting" ? "WALLET PROMPT…" : tx.status === "submitted" ? "CONFIRMING ON-CHAIN…" : "OPEN SOURCE APERTURE"}
                    </button>
                  )}
                </>
              )}

              {tx.hash && (
                <div className="mt-2">
                  <TxHashRibbon hash={tx.hash} status={tx.status === "confirmed" ? "confirmed" : tx.status === "failed" ? "failed" : "pending"} label="CHAIN STAMP" />
                </div>
              )}
              {tx.error && <p className="text-[10px] mt-2" style={{ color: "var(--pressure-red)" }}>{tx.error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-[10px]">
      <span style={{ color: "var(--muted-instrument)" }}>{label}</span>
      {value}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[10px]">
      <span style={{ color: "var(--muted-instrument)" }}>{label}: </span>
      <span style={{ fontFamily: "var(--font-data)", color: "var(--faint-parchment)" }}>{value}</span>
    </div>
  );
}
