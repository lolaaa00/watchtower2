"use client";

import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { useEffect, useState } from "react";
import { getContractSummary, getProfilesByOwner, getDueSources, getAlertsForProfile } from "@/lib/genlayer/reads";
import type { ContractSummary, WatchProfile, AlertRecord } from "@/lib/types";
import DossierCard from "@/components/shared/DossierCard";
import Link from "next/link";
import WatchtowerLogo from "@/components/shared/WatchtowerLogo";

export default function ObservatoryDeck() {
  const { connected, address, client, connect } = useWallet();
  const { profileId, setProfileId } = useActiveProfile();
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [dueSources, setDueSources] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  useEffect(() => {
    if (!client) return;
    getContractSummary(client).then(setSummary).catch((e) => console.warn("summary read failed:", e));
    if (address) {
      getProfilesByOwner(client, address).then((p) => {
        console.log("profiles loaded:", p);
        setProfiles(p);
        if (p.length > 0 && !profileId) setProfileId(p[0].profile_id);
      }).catch((e) => console.warn("profiles read failed:", e));
      getDueSources(client, Math.floor(Date.now() / 1000)).then(setDueSources).catch((e) => console.warn("due sources read failed:", e));
    }
  }, [client, address]);

  useEffect(() => {
    if (!client || !profileId) return;
    getAlertsForProfile(client, profileId, 0, 5).then(setAlerts).catch(() => {});
  }, [client, profileId]);

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-7.5rem)] px-6">
        <div className="max-w-md text-center animate-enter">
          <div className="mx-auto mb-5">
            <WatchtowerLogo size={56} />
          </div>
          <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>
            Watchtower
          </h1>
          <p className="text-sm font-semibold mb-1" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>
            Regulatory Impact Consensus Layer
          </p>
          <p className="text-[12px] leading-relaxed mb-7" style={{ color: "var(--muted-instrument)" }}>
            Official regulatory sources scanned on-chain. GenLayer validators judge impact. No hidden backend, no silent crawler.
          </p>

          <div className="obs-field p-5 text-left mb-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>
              Signal Path
            </p>
            {["Exposure Map — your company regulatory profile",
              "Authority Field — official sources registered on-chain",
              "Unresolved Signal — sources become due on schedule",
              "Signal Sweep — keeper triggers scan transaction",
              "Consensus Lens — GenLayer validators judge impact",
              "Impact Reading — alert stored with chain stamp",
            ].map((step, i) => (
              <div key={i} className="flex gap-3 mb-2.5 last:mb-0">
                <span className="text-[10px] font-bold shrink-0 mt-px" style={{ fontFamily: "var(--font-display-num)", color: "var(--regulatory-copper)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-[11px]" style={{ color: "var(--ash-paper)" }}>{step}</p>
              </div>
            ))}
          </div>

          <button onClick={connect} className="btn-copper px-6 py-2 text-[12px]" style={{ fontFamily: "var(--font-heading)" }}>
            CONNECT WALLET
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 animate-enter">
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-heading)" }}>Observatory Deck</h1>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-instrument)" }}>
            {profiles.length > 0 ? profiles[0].company_name : "No exposure map"} — live signal overview
          </p>
        </div>
        {profiles.length > 0 && (
          <select
            value={profileId || ""}
            onChange={(e) => setProfileId(e.target.value)}
            className="text-[11px] px-2 py-1"
            style={{ fontFamily: "var(--font-data)", background: "var(--surface-0)", border: "1px solid var(--border)", color: "var(--ash-paper)" }}
          >
            {profiles.map((p) => <option key={p.profile_id} value={p.profile_id}>{p.company_name}</option>)}
          </select>
        )}
      </div>

      {/* Instrument readings */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <Instrument label="Unresolved Signals" value={dueSources.length} color="var(--seismic-amber)" />
        <Instrument label="Open Impact Readings" value={alerts.filter((a) => a.status === "OPEN").length} color="var(--pressure-red)" />
        <Instrument label="Authority Sources" value={summary?.total_sources || 0} color="var(--authority-blue)" />
        <Instrument label="Signal Sweeps" value={summary?.total_scans || 0} color="var(--exposure-green)" />
      </div>

      {/* Sweep line */}
      <div className="animate-sweep mb-5" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Unresolved signals */}
        <div className="obs-field p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--seismic-amber)" }}>
              Unresolved Signals
            </p>
            {dueSources.length > 0 && (
              <Link href="/scan" className="btn-copper px-2.5 py-0.5 text-[9px]" style={{ fontFamily: "var(--font-heading)" }}>
                SWEEP →
              </Link>
            )}
          </div>
          {dueSources.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--muted-instrument)" }}>No sources due. Manual sweep available for urgent regulatory tremors.</p>
          ) : (
            <div className="space-y-1.5">
              {dueSources.map((sid) => (
                <div key={sid} className="obs-inset flex items-center justify-between px-3 py-2">
                  <span className="text-[10px]" style={{ fontFamily: "var(--font-data)", color: "var(--seismic-amber)" }}>{sid}</span>
                  <div className="w-[6px] h-[6px] rounded-full animate-signal" style={{ background: "var(--seismic-amber)" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent impact readings */}
        <div className="obs-field p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--pressure-red)" }}>
              Recent Impact Readings
            </p>
            {alerts.length > 0 && (
              <Link href="/alerts" className="text-[9px] font-bold uppercase" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>
                ALL →
              </Link>
            )}
          </div>
          {alerts.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--muted-instrument)" }}>No impact readings recorded for this exposure map.</p>
          ) : (
            <div className="space-y-1.5">
              {alerts.slice(0, 4).map((a) => (
                <Link key={a.alert_id} href={`/alerts/${a.alert_id}`}>
                  <DossierCard
                    title={a.document_title}
                    subtitle={`${a.authority} · ${a.jurisdiction}`}
                    status={a.status}
                    severity={a.urgency.includes("IMMEDIATE") || a.urgency.includes("EMERGENCY") ? "critical" : a.materiality === "MATERIAL" || a.materiality === "HIGHLY_MATERIAL" ? "high" : "medium"}
                    id={a.alert_id}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {profiles.length === 0 && (
        <div className="obs-field p-6 text-center mt-5">
          <p className="text-[12px] mb-3" style={{ color: "var(--muted-instrument)" }}>
            No exposure map exists. Create one so Watchtower can judge whether official regulatory tremors affect your operations.
          </p>
          <Link href="/profiles" className="btn-copper px-4 py-1.5 text-[11px] inline-block" style={{ fontFamily: "var(--font-heading)" }}>
            CREATE EXPOSURE MAP
          </Link>
        </div>
      )}
    </div>
  );
}

function Instrument({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="obs-inset p-3">
      <p className="text-[8px] font-bold uppercase tracking-[0.1em] mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-display-num)", color }}>{value}</p>
    </div>
  );
}
