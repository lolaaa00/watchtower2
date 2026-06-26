"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { getAlertsForProfile } from "@/lib/genlayer/reads";
import type { AlertRecord } from "@/lib/types";
import Link from "next/link";

export default function SecondReadingPage() {
  const { client } = useWallet();
  const { profileId } = useActiveProfile();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  useEffect(() => {
    if (!client || !profileId) return;
    getAlertsForProfile(client, profileId, 0, 100).then(setAlerts).catch(() => {});
  }, [client, profileId]);

  return (
    <div className="p-5 animate-enter">
      <h1 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-heading)" }}>Second Reading</h1>
      <p className="text-[11px] mb-6" style={{ color: "var(--muted-instrument)" }}>
        Challenge an impact classification through the consensus lens. A defined basis is required.
      </p>

      {alerts.length === 0 ? (
        <div className="obs-field p-6 text-center"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>No impact readings available for second reading.</p></div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Link key={a.alert_id} href={`/tribunal/${a.alert_id}`}>
              <div className="obs-field flex items-center justify-between px-4 py-3 transition-all hover:border-[var(--border-active)]">
                <div>
                  <p className="text-[12px] font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>{a.document_title}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: "var(--muted-instrument)" }}>{a.authority} · {a.urgency.replace(/_/g, " ")} · {a.materiality.replace(/_/g, " ")}</p>
                </div>
                <span className="indicator" style={{ background: "rgba(154,124,255,0.1)", color: "var(--consensus-uv)" }}>REVIEW</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
