"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { createWatchProfile } from "@/lib/genlayer/writes";
import { getProfilesByOwner } from "@/lib/genlayer/reads";
import { waitForTx } from "@/lib/genlayer/tx";
import TxHashRibbon from "@/components/shared/TxHashRibbon";
import type { TxState, WatchProfile } from "@/lib/types";

const INDUSTRIES = ["financial_services", "healthcare", "energy", "technology", "insurance", "real_estate"];
const RISK_AREAS = ["disclosure", "aml", "consumer_protection", "credit_risk", "data_privacy", "market_conduct", "operational_resilience", "cybersecurity", "reporting", "sanctions"];

export default function ExposureMapPage() {
  const { connected, client, address } = useWallet();
  const { profileId, setProfileId } = useActiveProfile();
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [form, setForm] = useState({
    company_name: "", industry: "financial_services", jurisdictions: "US", products: "",
    risk_areas: "disclosure|aml|consumer_protection", internal_teams: "legal|compliance|product|risk",
    keywords: "", excluded_topics: "",
  });

  useEffect(() => {
    if (!client || !address) return;
    getProfilesByOwner(client, address)
      .then((p) => {
        setProfiles(p);
        if (p.length > 0 && !profileId) setProfileId(p[0].profile_id);
      })
      .catch((e) => console.warn("Failed to load profiles:", e));
  }, [client, address, profileId, setProfileId]);

  const handleSubmit = async () => {
    if (!client || !form.company_name) return;
    try {
      setTx({ status: "prompting" });
      const hash = await createWatchProfile(client, form);
      setTx({ status: "submitted", hash: hash as string });
      await waitForTx(client, hash as `0x${string}`);
      setTx({ status: "confirmed", hash: hash as string });
      // Reload profiles
      if (address) {
        const updated = await getProfilesByOwner(client, address);
        setProfiles(updated);
        if (updated.length > 0) setProfileId(updated[updated.length - 1].profile_id);
      }
      setShowForm(false);
    } catch (e: any) {
      setTx({ status: "failed", error: e.message });
    }
  };

  if (!connected) {
    return (
      <div className="p-5 animate-enter">
        <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-heading)" }}>Exposure Map</h1>
        <p className="text-[11px] mt-2" style={{ color: "var(--muted-instrument)" }}>Connect wallet to define your regulatory exposure.</p>
      </div>
    );
  }

  return (
    <div className="p-5 animate-enter">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-heading)" }}>Exposure Map</h1>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-instrument)" }}>
            Your regulatory identity. All fields are public on-chain.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-copper px-3 py-1.5 text-[10px]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {showForm ? "CANCEL" : "NEW EXPOSURE MAP"}
        </button>
      </div>

      {/* Existing profiles */}
      {profiles.length > 0 && !showForm && (
        <div className="space-y-3 mb-6">
          {profiles.map((p) => (
            <div
              key={p.profile_id}
              className="obs-aperture p-4 cursor-pointer"
              onClick={() => setProfileId(p.profile_id)}
              style={{
                borderColor: profileId === p.profile_id ? "var(--regulatory-copper)" : undefined,
                borderLeftWidth: profileId === p.profile_id ? "3px" : undefined,
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-[14px] font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>
                    {p.company_name}
                  </h2>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-instrument)" }}>
                    {p.industry.replace(/_/g, " ")} · {p.jurisdictions.replace(/\|/g, ", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {profileId === p.profile_id && (
                    <span className="indicator" style={{ background: "rgba(192,106,61,0.12)", color: "var(--regulatory-copper)" }}>
                      ACTIVE
                    </span>
                  )}
                  <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>
                    {p.profile_id}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <ProfileField label="Products" value={p.products} />
                <ProfileField label="Risk Areas" value={p.risk_areas} />
                <ProfileField label="Teams" value={p.internal_teams} />
                <ProfileField label="Keywords" value={p.keywords} />
                {p.excluded_topics && <ProfileField label="Excluded" value={p.excluded_topics} />}
              </div>

              <div className="flex gap-4 mt-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>
                  Owner: {p.owner.slice(0, 8)}…{p.owner.slice(-6)}
                </span>
                <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>
                  Created: {new Date(p.created_at * 1000).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {profiles.length === 0 && !showForm && (
        <div className="obs-field p-6 text-center mb-6">
          <p className="text-[12px] mb-3" style={{ color: "var(--muted-instrument)" }}>
            No exposure map found for this wallet. Create one so Watchtower can judge regulatory impact for your company.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-copper px-4 py-1.5 text-[11px]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            CREATE EXPOSURE MAP
          </button>
        </div>
      )}

      {/* Creation form */}
      {showForm && (
        <div className="obs-field p-5 space-y-4 max-w-xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>
            New Exposure Map
          </p>

          <InputField label="Company Name" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} placeholder="e.g. MeritDock Finance" />

          <div>
            <FieldLabel>Industry</FieldLabel>
            <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="w-full px-3 py-2 text-[12px]"
              style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)", fontFamily: "var(--font-body)" }}>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i.replace(/_/g, " ")}</option>)}
            </select>
          </div>

          <InputField label="Jurisdictions" value={form.jurisdictions} onChange={(v) => setForm({ ...form, jurisdictions: v })} placeholder="US|EU|NG" />
          <InputField label="Products" value={form.products} onChange={(v) => setForm({ ...form, products: v })} placeholder="digital_lending|payments" />

          <div>
            <FieldLabel>Risk Exposure Areas</FieldLabel>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {RISK_AREAS.map((r) => {
                const on = form.risk_areas.split("|").includes(r);
                return (
                  <button key={r} onClick={() => {
                    const cur = form.risk_areas.split("|").filter(Boolean);
                    setForm({ ...form, risk_areas: (on ? cur.filter((x) => x !== r) : [...cur, r]).join("|") });
                  }}
                    className="text-[10px] px-2.5 py-1 font-bold uppercase transition-all"
                    style={{
                      fontFamily: "var(--font-heading)",
                      border: `1px solid ${on ? "var(--regulatory-copper)" : "var(--border)"}`,
                      color: on ? "var(--regulatory-copper)" : "var(--muted-instrument)",
                      background: on ? "rgba(192,106,61,0.08)" : "transparent",
                    }}>
                    {r.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>

          <InputField label="Internal Teams" value={form.internal_teams} onChange={(v) => setForm({ ...form, internal_teams: v })} placeholder="legal|compliance|product|risk" />
          <InputField label="Keywords (optional)" value={form.keywords} onChange={(v) => setForm({ ...form, keywords: v })} placeholder="CFPB|fintech" />
          <InputField label="Excluded Topics" value={form.excluded_topics} onChange={(v) => setForm({ ...form, excluded_topics: v })} placeholder="agriculture|energy|defense|immigration" />

          <button onClick={handleSubmit} disabled={tx.status === "prompting" || tx.status === "submitted" || !form.company_name}
            className="btn-copper w-full py-2.5 text-[11px]" style={{ fontFamily: "var(--font-heading)" }}>
            {tx.status === "prompting" ? "WALLET PROMPT…" : tx.status === "submitted" ? "CONFIRMING…" : "CREATE EXPOSURE MAP"}
          </button>

          {tx.hash && <TxHashRibbon hash={tx.hash} status={tx.status === "confirmed" ? "confirmed" : tx.status === "failed" ? "failed" : "pending"} label="CHAIN STAMP" />}
          {tx.error && <p className="text-[11px]" style={{ color: "var(--pressure-red)" }}>{tx.error}</p>}
        </div>
      )}
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>
        {label}
      </span>
      <p className="text-[10px] mt-0.5" style={{ color: "var(--faint-parchment)" }}>
        {value.replace(/\|/g, " · ")}
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[9px] font-bold uppercase tracking-[0.1em] mb-1 block" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>{children}</label>;
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-[12px] outline-none"
        style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)", fontFamily: "var(--font-body)" }} />
    </div>
  );
}
