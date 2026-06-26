"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/hooks/useWallet";
import { getAlert } from "@/lib/genlayer/reads";
import { dismissAlert } from "@/lib/genlayer/writes";
import { waitForTx } from "@/lib/genlayer/tx";
import type { AlertRecord, TxState } from "@/lib/types";
import VerdictSeal from "@/components/shared/VerdictSeal";
import ImpactRing from "@/components/shared/ImpactRing";
import TxHashRibbon from "@/components/shared/TxHashRibbon";
import Link from "next/link";
import { RELEVANCE_COLORS, MATERIALITY_COLORS, URGENCY_COLORS } from "@/lib/constants/enums";

export default function ImpactCasefilePage() {
  const params = useParams();
  const alertId = params.alertId as string;
  const { client } = useWallet();
  const [alert, setAlert] = useState<AlertRecord | null>(null);
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  useEffect(() => {
    if (!client || !alertId) return;
    getAlert(client, alertId).then(setAlert).catch(() => {});
  }, [client, alertId]);

  const handleDismiss = async () => {
    if (!client || !alertId) return;
    try {
      setTx({ status: "prompting" });
      const hash = await dismissAlert(client, alertId, "Dismissed by profile owner");
      setTx({ status: "submitted", hash: hash as string });
      await waitForTx(client, hash as `0x${string}`);
      setTx({ status: "confirmed", hash: hash as string });
      getAlert(client, alertId).then(setAlert).catch(() => {});
    } catch (e: any) { setTx({ status: "failed", error: e.message }); }
  };

  if (!alert) return <div className="p-5"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>Loading impact casefile…</p></div>;

  return (
    <div className="p-5 animate-enter">
      {/* Title band */}
      <div className="obs-field p-4 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-black" style={{ fontFamily: "var(--font-heading)" }}>{alert.document_title}</h1>
            <p className="text-[10px] mt-1" style={{ color: "var(--muted-instrument)" }}>{alert.authority} · {alert.jurisdiction} · {alert.publication_date}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>{alert.alert_id}</span>
            <span className="indicator" style={{
              background: alert.status === "OPEN" ? "rgba(255,179,71,0.1)" : "rgba(89,209,140,0.1)",
              color: alert.status === "OPEN" ? "var(--seismic-amber)" : "var(--exposure-green)",
            }}>{alert.status}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Magnitude dial + consensus lens */}
        <div className="space-y-4">
          <div className="obs-inset p-5 flex justify-center">
            <ImpactRing relevance={alert.relevance} materiality={alert.materiality} urgency={alert.urgency} confidence={alert.confidence} size={130} />
          </div>
          <div className="obs-field p-4">
            <div className="grid grid-cols-2 gap-4">
              <VerdictSeal label="Exposure" value={alert.relevance} color={RELEVANCE_COLORS[alert.relevance]} />
              <VerdictSeal label="Magnitude" value={alert.materiality} color={MATERIALITY_COLORS[alert.materiality]} />
              <VerdictSeal label="Pressure" value={alert.urgency} color={URGENCY_COLORS[alert.urgency]} />
              <VerdictSeal label="Type" value={alert.document_type} color="var(--regulatory-copper)" />
            </div>
          </div>
        </div>

        {/* Center: Impact reading content */}
        <div className="space-y-4">
          <div className="obs-trace pl-4 py-3 pr-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>Impact Summary</p>
            <p className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--ash-paper)" }}>{alert.short_extract}</p>
          </div>
          <div className="obs-field p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Regulatory Context</p>
            <p className="text-[11px] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--muted-instrument)" }}>{alert.reason}</p>
          </div>
          <div className="obs-field p-4 space-y-1.5">
            <CRow label="Compliance Writ" value={alert.recommended_action.replace(/_/g, " ")} />
            <CRow label="Responsible Team" value={alert.responsible_team} />
            <CRow label="Impact Area" value={alert.impact_area} />
            <CRow label="Confidence" value={`${alert.confidence}%`} />
            <CRow label="Sweep ID" value={alert.scan_id} mono />
            <CRow label="Content Digest" value={alert.source_item_digest} mono />
          </div>
        </div>

        {/* Right: Source evidence + actions */}
        <div className="space-y-4">
          <div className="obs-inset p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] mb-3" style={{ fontFamily: "var(--font-heading)", color: "var(--authority-blue)" }}>Source Evidence</p>
            <div className="space-y-2.5 text-[10px]">
              <div>
                <span style={{ color: "var(--muted-instrument)" }}>Official URL</span>
                <a href={alert.official_url} target="_blank" rel="noopener noreferrer" className="block hover:underline truncate" style={{ fontFamily: "var(--font-data)", color: "var(--authority-blue)" }}>
                  {alert.official_url}
                </a>
              </div>
              <div>
                <span style={{ color: "var(--muted-instrument)" }}>Authority</span>
                <p style={{ fontFamily: "var(--font-data)", color: "var(--faint-parchment)" }}>{alert.authority}</p>
              </div>
              <div>
                <span style={{ color: "var(--muted-instrument)" }}>Jurisdiction</span>
                <p style={{ fontFamily: "var(--font-data)", color: "var(--faint-parchment)" }}>{alert.jurisdiction}</p>
              </div>
              <div>
                <span style={{ color: "var(--muted-instrument)" }}>Publication</span>
                <p style={{ fontFamily: "var(--font-data)", color: "var(--faint-parchment)" }}>{alert.publication_date}</p>
              </div>
            </div>
          </div>

          <div className="obs-field p-3 space-y-2">
            <Link href={`/tribunal/${alert.alert_id}`} className="block w-full text-center text-[10px] py-2 font-bold uppercase" style={{ fontFamily: "var(--font-heading)", background: "var(--consensus-uv)", color: "white" }}>
              Request Second Reading
            </Link>
            {alert.status === "OPEN" && (
              <button onClick={handleDismiss} className="btn-outline w-full py-1.5 text-[10px] font-bold uppercase" style={{ fontFamily: "var(--font-heading)" }}>
                Dismiss
              </button>
            )}
            {tx.hash && <TxHashRibbon hash={tx.hash} status={tx.status === "confirmed" ? "confirmed" : "pending"} label="CHAIN STAMP" />}
          </div>

          <p className="text-[8px]" style={{ color: "var(--muted-instrument)" }}>
            Compliance intelligence only. Not legal advice. Review with qualified professionals before acting.
          </p>
        </div>
      </div>
    </div>
  );
}

function CRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span style={{ color: "var(--muted-instrument)" }}>{label}</span>
      <span style={{ fontFamily: mono ? "var(--font-data)" : "var(--font-body)", color: "var(--faint-parchment)" }}>{value}</span>
    </div>
  );
}
