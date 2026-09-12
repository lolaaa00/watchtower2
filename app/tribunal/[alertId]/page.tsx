"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@/lib/hooks/useWallet";
import { getAlert, getContractSummary, getReview } from "@/lib/genlayer/reads";
import { requestReReview } from "@/lib/genlayer/writes";
import { waitForTx } from "@/lib/genlayer/tx";
import type { AlertRecord, ReviewRecord, TxState } from "@/lib/types";

const OUTCOME_COPY: Record<string, { text: string; tone: "ok" | "warn" | "fail" }> = {
  UPHELD: { text: "Original classification independently re-verified and upheld — no change.", tone: "ok" },
  RECLASSIFIED: { text: "Second reading reclassified this finding. Casefile updated through consensus lens.", tone: "ok" },
  URGENCY_RAISED: { text: "Second reading raised the urgency rating. Casefile updated.", tone: "ok" },
  URGENCY_REDUCED: { text: "Second reading reduced the urgency rating. Casefile updated.", tone: "ok" },
  MATERIALITY_RAISED: { text: "Second reading raised the materiality rating. Casefile updated.", tone: "ok" },
  MATERIALITY_REDUCED: { text: "Second reading reduced the materiality rating. Casefile updated.", tone: "ok" },
  MORE_CONTEXT_REQUIRED: {
    text: "The re-fetched source did not provide enough evidence to responsibly reclassify. The original classification is unchanged. You may retry once more context is available.",
    tone: "warn",
  },
  SOURCE_UNVERIFIABLE: {
    text: "The source could not be independently re-verified (fetch failed or returned no usable content). The original classification is unchanged. This is retryable — try again once the source is reachable.",
    tone: "warn",
  },
  REVIEW_FAILED: {
    text: "A technical failure occurred during independent verification — no decision was reached, and nothing was changed. This is retryable.",
    tone: "fail",
  },
};
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
  const [review, setReview] = useState<ReviewRecord | null>(null);
  const [reviewLoadFailed, setReviewLoadFailed] = useState(false);

  useEffect(() => {
    if (!client || !alertId) return;
    getAlert(client, alertId).then(setAlert).catch(() => {});
  }, [client, alertId]);

  const submit = async () => {
    if (!client || !alertId || note.length < 10) return;
    setReview(null);
    setReviewLoadFailed(false);
    try {
      // Capture the review counter before submitting so the specific review
      // record this submission produces can be looked up afterward -- the
      // write's own tx status only proves consensus was reached at all, not
      // what business-level outcome (UPHELD vs SOURCE_UNVERIFIABLE vs
      // REVIEW_FAILED, etc.) it actually resolved to.
      const before = await getContractSummary(client);
      setTx({ status: "prompting" });
      const hash = await requestReReview(client, alertId, reason, note);
      setTx({ status: "submitted", hash: hash as string });
      await waitForTx(client, hash as `0x${string}`);
      setTx({ status: "confirmed", hash: hash as string });
      getAlert(client, alertId).then(setAlert).catch(() => {});
      const reviewId = `REV-${String(before.total_reviews + 1).padStart(6, "0")}`;
      try {
        const rec = await getReview(client, reviewId);
        setReview(rec);
      } catch {
        setReviewLoadFailed(true);
      }
    } catch (e: any) { setTx({ status: "failed", error: e.message }); }
  };

  if (!alert) return <div className="p-5"><p className="text-[15px]" style={{ color: "var(--muted-instrument)" }}>Loading…</p></div>;

  return (
    <div className="p-8 max-w-5xl mx-auto animate-enter">
      <h1 className="text-2xl font-black mb-6" style={{ fontFamily: "var(--font-heading)" }}>Second Reading</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="obs-field p-5">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] mb-4" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Original Reading</p>
          <div className="space-y-3">
            <VerdictSeal label="Exposure" value={alert.relevance} />
            <VerdictSeal label="Magnitude" value={alert.materiality} />
            <VerdictSeal label="Pressure" value={alert.urgency} />
            <VerdictSeal label="Writ" value={alert.recommended_action} />
          </div>
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-[16px]" style={{ color: "var(--muted-instrument)" }}>{alert.document_title}</p>
            <p className="text-[12.5px] mt-1" style={{ fontFamily: "var(--font-data)", color: "var(--instrument-graphite)" }}>{alert.alert_id}</p>
          </div>
        </div>

        <div className="obs-field p-5 space-y-3">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--consensus-uv)" }}>Challenge Basis</p>
          <div>
            <label className="text-[15px] font-bold uppercase tracking-[0.1em] mb-1 block" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value as any)} className="w-full px-3 py-2 text-[15px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }}>
              {RE_REVIEW_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[15px] font-bold uppercase tracking-[0.1em] mb-1 block" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Challenge Note (min 10 chars)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Define basis for second reading…" className="w-full px-3 py-2 text-[15px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
          </div>
          <button onClick={submit} disabled={note.length < 10 || tx.status === "prompting" || tx.status === "submitted"} className="w-full py-2 text-[16px] font-bold uppercase disabled:opacity-40" style={{ fontFamily: "var(--font-heading)", background: "var(--consensus-uv)", color: "white" }}>
            {tx.status === "prompting" ? "WALLET PROMPT…" : tx.status === "submitted" ? "CONSENSUS ACTIVE…" : "SUBMIT SECOND READING"}
          </button>
          {tx.hash && <TxHashRibbon hash={tx.hash} status={tx.status === "confirmed" ? "confirmed" : "pending"} label="CHAIN STAMP" />}
          {tx.error && <p className="text-[16px]" style={{ color: "var(--pressure-red)" }}>{tx.error}</p>}
        </div>

        <div className="obs-inset p-4">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] mb-3" style={{ fontFamily: "var(--font-heading)", color: "var(--consensus-uv)" }}>Reading Outcome</p>
          {tx.status === "confirmed" && review ? (
            <div>
              <p
                className="text-[12.5px] font-bold uppercase tracking-[0.1em] mb-1"
                style={{
                  fontFamily: "var(--font-heading)",
                  color:
                    OUTCOME_COPY[review.outcome]?.tone === "fail"
                      ? "var(--pressure-red)"
                      : OUTCOME_COPY[review.outcome]?.tone === "warn"
                      ? "var(--seismic-amber)"
                      : "var(--exposure-green)",
                }}
              >
                {review.outcome.replace(/_/g, " ")}
              </p>
              <p className="text-[16px]" style={{ color: "var(--signal-bone)" }}>
                {OUTCOME_COPY[review.outcome]?.text ?? review.outcome}
              </p>
            </div>
          ) : tx.status === "confirmed" && reviewLoadFailed ? (
            <p className="text-[16px]" style={{ color: "var(--seismic-amber)" }}>
              Consensus was reached, but the resulting outcome could not be read back from chain. Reload
              this page to check whether the classification changed.
            </p>
          ) : tx.status === "confirmed" ? (
            <p className="text-[16px]" style={{ color: "var(--muted-instrument)" }}>Reading resulting outcome…</p>
          ) : (
            <p className="text-[16px]" style={{ color: "var(--muted-instrument)" }}>Submit a challenge basis to trigger GenLayer validator re-evaluation.</p>
          )}
        </div>
      </div>
    </div>
  );
}
