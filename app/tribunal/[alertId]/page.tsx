"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/hooks/useWallet";
import { getAlert } from "@/lib/genlayer/reads";
import { requestReReview } from "@/lib/genlayer/writes";
import { waitForTx } from "@/lib/genlayer/tx";
import type { AlertRecord, TxState } from "@/lib/types";
import { RE_REVIEW_REASONS } from "@/lib/constants/enums";
import VerdictSeal from "@/components/shared/VerdictSeal";
import TxHashRibbon from "@/components/shared/TxHashRibbon";

export default function SecondReadingCasePage() {
  const params = useParams();
  const alertId = params.alertId as string;
  const { client } = useWallet();
  const [alert, setAlert] = useState<AlertRecord | null>(null);
  const [reason, setReason] = useState(RE_REVIEW_REASONS[0]);
  const [note, setNote] = useState("");
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  useEffect(() => {
    if (!client || !alertId) return;
    getAlert(client, alertId).then(setAlert).catch(() => {});
  }, [client, alertId]);

  const submit = async () => {
    if (!client || !alertId || note.length < 10) return;
    try {
      setTx({ status: "prompting" });
      const hash = await requestReReview(client, alertId, reason, note);
      setTx({ status: "submitted", hash: hash as string });
      await waitForTx(client, hash as `0x${string}`);
      setTx({ status: "confirmed", hash: hash as string });
      getAlert(client, alertId).then(setAlert).catch(() => {});
    } catch (e: any) { setTx({ status: "failed", error: e.message }); }
  };

  if (!alert) return <div className="p-5"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>Loading…</p></div>;

  return (
    <div className="p-5 animate-enter">
      <h1 className="text-2xl font-black mb-6" style={{ fontFamily: "var(--font-heading)" }}>Second Reading</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="obs-field p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Original Reading</p>
          <div className="space-y-3">
            <VerdictSeal label="Exposure" value={alert.relevance} />
            <VerdictSeal label="Magnitude" value={alert.materiality} />
            <VerdictSeal label="Pressure" value={alert.urgency} />
            <VerdictSeal label="Writ" value={alert.recommended_action} />
          </div>
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-[10px]" style={{ color: "var(--muted-instrument)" }}>{alert.document_title}</p>
            <p className="text-[9px] mt-1" style={{ fontFamily: "var(--font-data)", color: "var(--instrument-graphite)" }}>{alert.alert_id}</p>
          </div>
        </div>

        <div className="obs-field p-5 space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--consensus-uv)" }}>Challenge Basis</p>
          <div>
            <label className="text-[8px] font-bold uppercase tracking-[0.1em] mb-1 block" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value as any)} className="w-full px-3 py-2 text-[12px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }}>
              {RE_REVIEW_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase tracking-[0.1em] mb-1 block" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Challenge Note (min 10 chars)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Define basis for second reading…" className="w-full px-3 py-2 text-[12px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
          </div>
          <button onClick={submit} disabled={note.length < 10 || tx.status === "prompting" || tx.status === "submitted"} className="w-full py-2 text-[10px] font-bold uppercase disabled:opacity-40" style={{ fontFamily: "var(--font-heading)", background: "var(--consensus-uv)", color: "white" }}>
            {tx.status === "prompting" ? "WALLET PROMPT…" : tx.status === "submitted" ? "CONSENSUS ACTIVE…" : "SUBMIT SECOND READING"}
          </button>
          {tx.hash && <TxHashRibbon hash={tx.hash} status={tx.status === "confirmed" ? "confirmed" : "pending"} label="CHAIN STAMP" />}
          {tx.error && <p className="text-[10px]" style={{ color: "var(--pressure-red)" }}>{tx.error}</p>}
        </div>

        <div className="obs-inset p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] mb-3" style={{ fontFamily: "var(--font-heading)", color: "var(--consensus-uv)" }}>Reading Outcome</p>
          {tx.status === "confirmed" ? (
            <p className="text-[11px]" style={{ color: "var(--exposure-green)" }}>Second reading complete. Impact casefile updated through consensus lens.</p>
          ) : (
            <p className="text-[10px]" style={{ color: "var(--muted-instrument)" }}>Submit a challenge basis to trigger GenLayer validator re-evaluation.</p>
          )}
        </div>
      </div>
    </div>
  );
}
