"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { getDueSources, getSources } from "@/lib/genlayer/reads";
import { runSourceScan, runManualScan } from "@/lib/genlayer/writes";
import { waitForTx } from "@/lib/genlayer/tx";
import type { SourceRecord, TxState } from "@/lib/types";
import TxHashRibbon from "@/components/shared/TxHashRibbon";

export default function SignalSweepPage() {
  const { connected, client } = useWallet();
  const { profileId } = useActiveProfile();
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [dueSources, setDueSources] = useState<string[]>([]);
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [sweeping, setSweeping] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [mf, setMf] = useState({ sourceId: "", dateFrom: "", dateTo: "", reason: "" });
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (!client) return;
    getSources(client).then(setSources).catch(() => {});
    getDueSources(client, Math.floor(Date.now() / 1000)).then(setDueSources).catch(() => {});
  }, [client]);

  const sweep = async (sid: string) => {
    if (!client || !profileId) return;
    const today = new Date().toISOString().split("T")[0];
    const week = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    try {
      setSweeping(sid); setTx({ status: "prompting" });
      setLog((l) => [...l, `${sid} → wallet signature requested`]);
      const hash = await runSourceScan(client, profileId, sid, week, today);
      setTx({ status: "submitted", hash: hash as string });
      setLog((l) => [...l, `${sid} → tx ${(hash as string).slice(0, 14)}…`]);
      await waitForTx(client, hash as `0x${string}`);
      setTx({ status: "confirmed", hash: hash as string });
      setLog((l) => [...l, `${sid} → sweep complete`]);
      getDueSources(client, Math.floor(Date.now() / 1000)).then(setDueSources).catch(() => {});
    } catch (e: any) {
      setTx({ status: "failed", error: e.message });
      setLog((l) => [...l, `${sid} → error: ${e.message}`]);
    } finally { setSweeping(null); }
  };

  const manualSweep = async () => {
    if (!client || !profileId || !mf.sourceId || !mf.reason) return;
    try {
      setTx({ status: "prompting" });
      const hash = await runManualScan(client, profileId, mf.sourceId, mf.dateFrom, mf.dateTo, mf.reason);
      setTx({ status: "submitted", hash: hash as string });
      await waitForTx(client, hash as `0x${string}`);
      setTx({ status: "confirmed", hash: hash as string });
    } catch (e: any) { setTx({ status: "failed", error: e.message }); }
  };

  const sweepAll = async () => { for (const s of dueSources) await sweep(s); };

  if (!connected) return <div className="p-5 animate-enter"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>Connect wallet to access the Signal Sweep Chamber.</p></div>;
  if (!profileId) return <div className="p-5 animate-enter"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>Create an exposure map first.</p></div>;

  return (
    <div className="p-5 animate-enter">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-heading)" }}>Signal Sweep Chamber</h1>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-instrument)" }}>
            Wallet-triggered sweeps only. No hidden backend. No autonomous cron.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setManual(!manual)} className="btn-outline px-3 py-1 text-[10px] font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            {manual ? "QUEUE" : "MANUAL"}
          </button>
          {dueSources.length > 0 && !manual && (
            <button onClick={sweepAll} className="btn-copper px-3 py-1 text-[10px]" style={{ fontFamily: "var(--font-heading)" }}>
              SWEEP ALL ({dueSources.length})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-2">
          {!manual ? (
            dueSources.length === 0 ? (
              <div className="obs-field p-5"><p className="text-[11px]" style={{ color: "var(--muted-instrument)" }}>No unresolved signals. All source apertures within schedule.</p></div>
            ) : dueSources.map((sid) => {
              const src = sources.find((s) => s.source_id === sid);
              return (
                <div key={sid} className="obs-field flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-[6px] h-[6px] rounded-full animate-signal" style={{ background: "var(--seismic-amber)" }} />
                    <span className="text-[12px] font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>{src?.authority || sid}</span>
                    <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>{sid}</span>
                  </div>
                  <button onClick={() => sweep(sid)} disabled={sweeping === sid} className="btn-copper px-3 py-1 text-[10px]" style={{ fontFamily: "var(--font-heading)" }}>
                    {sweeping === sid ? "SWEEPING…" : "SWEEP"}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="obs-field p-5 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--consensus-uv)" }}>Manual Signal Sweep</p>
              <select value={mf.sourceId} onChange={(e) => setMf({ ...mf, sourceId: e.target.value })} className="w-full px-3 py-2 text-[12px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }}>
                <option value="">Select source aperture…</option>
                {sources.map((s) => <option key={s.source_id} value={s.source_id}>{s.authority} ({s.source_id})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={mf.dateFrom} onChange={(e) => setMf({ ...mf, dateFrom: e.target.value })} className="px-3 py-2 text-[12px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
                <input type="date" value={mf.dateTo} onChange={(e) => setMf({ ...mf, dateTo: e.target.value })} className="px-3 py-2 text-[12px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
              </div>
              <textarea value={mf.reason} onChange={(e) => setMf({ ...mf, reason: e.target.value })} placeholder="Reason for manual sweep…" rows={2} className="w-full px-3 py-2 text-[12px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
              <button onClick={manualSweep} disabled={!mf.sourceId || !mf.reason} className="w-full py-2 text-[11px] font-bold disabled:opacity-40" style={{ fontFamily: "var(--font-heading)", background: "var(--consensus-uv)", color: "white" }}>
                INITIATE MANUAL SWEEP
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="obs-inset p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-3" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>Consensus Lens</p>
            {tx.status === "idle" ? (
              <p className="text-[10px]" style={{ color: "var(--muted-instrument)" }}>Select a source aperture to begin signal sweep.</p>
            ) : (
              <div className="space-y-2.5">
                <SweepStep label="Wallet signature" active={tx.status === "prompting"} done={["submitted","confirming","confirmed"].includes(tx.status)} />
                <SweepStep label="Transaction submitted" active={tx.status === "submitted"} done={tx.status === "confirmed"} />
                <SweepStep label="Consensus lens active" active={tx.status === "submitted"} done={tx.status === "confirmed"} />
                <SweepStep label="Impact reading stored" active={false} done={tx.status === "confirmed"} />
                {tx.status === "failed" && <p className="text-[10px]" style={{ color: "var(--pressure-red)" }}>{tx.error}</p>}
              </div>
            )}
            {tx.hash && <div className="mt-3"><TxHashRibbon hash={tx.hash} status={tx.status === "confirmed" ? "confirmed" : tx.status === "failed" ? "failed" : "pending"} label="CHAIN STAMP" /></div>}
          </div>

          {log.length > 0 && (
            <div className="obs-inset p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Sweep Log</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {log.map((m, i) => <p key={i} className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>{m}</p>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SweepStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[7px] h-[7px] rounded-full" style={{ background: done ? "var(--exposure-green)" : active ? "var(--seismic-amber)" : "var(--instrument-graphite)" }} />
      <span className="text-[10px] font-semibold" style={{ fontFamily: "var(--font-heading)", color: done ? "var(--exposure-green)" : active ? "var(--seismic-amber)" : "var(--muted-instrument)" }}>
        {label}
      </span>
    </div>
  );
}
