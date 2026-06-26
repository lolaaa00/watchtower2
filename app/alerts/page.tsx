"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { getAlertsForProfile } from "@/lib/genlayer/reads";
import type { AlertRecord } from "@/lib/types";
import DossierCard from "@/components/shared/DossierCard";
import Link from "next/link";

const FILTERS = ["ALL", "OPEN", "IMMEDIATE_REVIEW", "EMERGENCY_ACTION", "MATERIAL", "HIGHLY_MATERIAL"];

export default function ImpactReadingsPage() {
  const { client } = useWallet();
  const { profileId } = useActiveProfile();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    if (!client || !profileId) return;
    getAlertsForProfile(client, profileId, 0, 100).then(setAlerts).catch(() => {});
  }, [client, profileId]);

  const filtered = filter === "ALL" ? alerts : alerts.filter((a) => a.urgency === filter || a.status === filter || a.materiality === filter);

  return (
    <div className="p-5 animate-enter">
      <h1 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-heading)" }}>Impact Readings</h1>
      <p className="text-[11px] mb-5" style={{ color: "var(--muted-instrument)" }}>
        Consensus-backed regulatory impact records. Source first. Consensus second. Chain stamp third.
      </p>

      <div className="flex gap-1.5 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="text-[9px] px-2.5 py-1 font-bold uppercase transition-all"
            style={{
              fontFamily: "var(--font-heading)",
              border: `1px solid ${filter === f ? "var(--regulatory-copper)" : "var(--border)"}`,
              color: filter === f ? "var(--regulatory-copper)" : "var(--muted-instrument)",
              background: filter === f ? "rgba(192,106,61,0.08)" : "transparent",
            }}>
            {f.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {!profileId ? (
        <p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>Select an exposure map to view impact readings.</p>
      ) : alerts.length === 0 ? (
        <div className="obs-field p-6 text-center"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>No impact readings recorded for this exposure map.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Link key={a.alert_id} href={`/alerts/${a.alert_id}`}>
              <DossierCard
                title={a.document_title}
                subtitle={`${a.authority} · ${a.jurisdiction} · ${a.document_type?.replace(/_/g, " ")}`}
                status={a.status}
                severity={a.urgency.includes("IMMEDIATE") || a.urgency.includes("EMERGENCY") ? "critical" : a.materiality === "HIGHLY_MATERIAL" || a.materiality === "MATERIAL" ? "high" : a.relevance === "MEDIUM" ? "medium" : "low"}
                id={a.alert_id}
                meta={[
                  { label: "Exposure", value: a.relevance },
                  { label: "Magnitude", value: a.materiality.replace(/_/g, " ") },
                  { label: "Pressure", value: a.urgency.replace(/_/g, " ") },
                  { label: "Writ", value: a.recommended_action.replace(/_/g, " ") },
                ]}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
