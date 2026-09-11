"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { getDueSources, getSources, getKeeperScanIds, getScan } from "@/lib/genlayer/reads";
import { runSourceScan, runSourceScanBonded, runManualScan, claimBond, challengeScan, KEEPER_BOND_WEI } from "@/lib/genlayer/writes";
import { pollTransactionLifecycle } from "@/lib/genlayer/tx";
import type { SourceRecord, ScanRecord, TxState, TxStatus } from "@/lib/types";
import TxHashRibbon from "@/components/shared/TxHashRibbon";

function formatGen(wei: number) {
  return (wei / 1e18).toFixed(4).replace(/\.?0+$/, "") + " GEN";
}

const STAGE_ORDER: TxStatus[] = ["PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const STAGE_LABEL: Record<string, string> = {
  PENDING: "Queued",
  PROPOSING: "Leader proposing",
  COMMITTING: "Validators committing",
  REVEALING: "Validators revealing",
  ACCEPTED: "Accepted (appeal window open)",
  FINALIZED: "Finalized",
};

export default function SignalSweepPage() {
  const { connected, ready, client, address } = useWallet();
  const { profileId } = useActiveProfile();
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [dueSources, setDueSources] = useState<string[]>([]);
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [sweeping, setSweeping] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [bonded, setBonded] = useState(false);
  const [mf, setMf] = useState({ sourceId: "", dateFrom: "", dateTo: "", reason: "" });
  const [log, setLog] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [retrySid, setRetrySid] = useState<string | null>(null);
  const [myBonds, setMyBonds] = useState<ScanRecord[]>([]);
  const [bondBusy, setBondBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!tx.startedAt || ["FINALIZED", "UNDETERMINED", "failed", "idle", "CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(tx.status)) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - tx.startedAt!) / 1000)), 1000);
    return () => clearInterval(id);
  }, [tx.startedAt, tx.status]);

  useEffect(() => {
    if (!client) return;
    getSources(client).then(setSources).catch(() => {});
    getDueSources(client, Math.floor(Date.now() / 1000)).then(setDueSources).catch(() => {});
  }, [client]);

  const refreshBonds = async () => {
    if (!client || !address) return;
    const ids = await getKeeperScanIds(client, address, 0, 50);
    const scans = await Promise.all(ids.map((id) => getScan(client, id).catch(() => null)));
    setMyBonds(scans.filter((s): s is ScanRecord => !!s && s.bond_status !== "NONE"));
  };

  useEffect(() => {
    refreshBonds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, address]);

  const sweep = async (sid: string) => {
    if (!client || !profileId) return;
    const today = new Date().toISOString().split("T")[0];
    const week = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const sweepStartedAt = Date.now();
    setRetrySid(null);
    try {
      setSweeping(sid); setTx({ status: "prompting", startedAt: sweepStartedAt });
      setLog((l) => [...l, `${sid} → wallet signature requested${bonded ? ` (bonding ${formatGen(Number(KEEPER_BOND_WEI))})` : ""}`]);
      const hash = bonded
        ? await runSourceScanBonded(client, profileId, sid, week, today)
        : await runSourceScan(client, profileId, sid, week, today);
      setTx({ status: "submitted", hash: hash as string, startedAt: sweepStartedAt });
      setLog((l) => [...l, `${sid} → tx ${(hash as string).slice(0, 14)}…`]);

      const result = await pollTransactionLifecycle(client, hash as string, (u) => {
        setTx({ status: u.status as TxStatus, hash: u.hash, retryable: u.retryable, startedAt: sweepStartedAt });
        setLog((l) => [...l, `${sid} → ${u.status}`]);
      });

      if (result.retryable) {
        setLog((l) => [...l, `${sid} → ${result.status}: validators did not reach agreement, nothing was written. You can retry.`]);
        setRetrySid(sid);
      } else if (result.status === "FINALIZED" || result.status === "ACCEPTED") {
        setLog((l) => [...l, `${sid} → sweep ${result.status === "FINALIZED" ? "finalized" : "accepted (still appealable)"}`]);
        getDueSources(client, Math.floor(Date.now() / 1000)).then(setDueSources).catch(() => {});
        if (bonded) refreshBonds();
      }
    } catch (e: any) {
      setTx({ status: "failed", error: e.message });
      setLog((l) => [...l, `${sid} → error: ${e.message}`]);
    } finally { setSweeping(null); }
  };

  const manualSweep = async () => {
    if (!client || !profileId || !mf.sourceId || !mf.reason) return;
    const manualStartedAt = Date.now();
    try {
      setTx({ status: "prompting", startedAt: manualStartedAt });
      const hash = await runManualScan(client, profileId, mf.sourceId, mf.dateFrom, mf.dateTo, mf.reason);
      setTx({ status: "submitted", hash: hash as string, startedAt: manualStartedAt });
      const result = await pollTransactionLifecycle(client, hash as string, (u) => {
        setTx({ status: u.status as TxStatus, hash: u.hash, retryable: u.retryable, startedAt: manualStartedAt });
      });
      if (result.retryable) setRetrySid(mf.sourceId);
    } catch (e: any) { setTx({ status: "failed", error: e.message }); }
  };

  const handleClaim = async (scanId: string) => {
    if (!client) return;
    setBondBusy(scanId);
    try {
      const hash = await claimBond(client, scanId);
      await pollTransactionLifecycle(client, hash as string, () => {});
      await refreshBonds();
    } catch (e: any) {
      setLog((l) => [...l, `${scanId} → claim failed: ${e.message}`]);
    } finally { setBondBusy(null); }
  };

  const handleChallenge = async () => {
    if (!client) return;
    const scanId = window.prompt("Bonded scan ID to challenge (e.g. SCN-000001) — must have alert_count 0:");
    if (!scanId) return;
    const evidenceScanId = window.prompt(
      "Later scan ID on the same source, overlapping date window, that found real alerts:"
    );
    if (!evidenceScanId) return;
    setBondBusy(scanId.trim());
    try {
      const hash = await challengeScan(client, scanId.trim(), evidenceScanId.trim());
      await pollTransactionLifecycle(client, hash as string, () => {});
      await refreshBonds();
      setLog((l) => [...l, `${scanId} → challenged and slashed`]);
    } catch (e: any) {
      setLog((l) => [...l, `${scanId} → challenge failed: ${e.message}`]);
    } finally { setBondBusy(null); }
  };

  const sweepAll = async () => { for (const s of dueSources) await sweep(s); };

  if (!ready) return <div className="p-8 max-w-5xl mx-auto animate-enter"><p className="text-[15px]" style={{ color: "var(--muted-instrument)" }}>Preparing your wallet…</p></div>;
  if (!connected) return <div className="p-8 max-w-5xl mx-auto animate-enter"><p className="text-[15px]" style={{ color: "var(--muted-instrument)" }}>Connect wallet to access the Signal Sweep Chamber.</p></div>;
  if (!profileId) return <div className="p-8 max-w-5xl mx-auto animate-enter"><p className="text-[15px]" style={{ color: "var(--muted-instrument)" }}>Create an exposure map first.</p></div>;

  return (
    <div className="p-8 max-w-5xl mx-auto animate-enter">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-heading)" }}>Signal Sweep Chamber</h1>
          <p className="text-[17px] mt-0.5" style={{ color: "var(--muted-instrument)" }}>
            Wallet-triggered sweeps only. No hidden backend. No autonomous cron.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!manual && (
            <label className="flex items-center gap-1.5 text-[13px] cursor-pointer select-none" style={{ fontFamily: "var(--font-heading)", color: bonded ? "var(--seismic-amber)" : "var(--muted-instrument)" }}>
              <input type="checkbox" checked={bonded} onChange={(e) => setBonded(e.target.checked)} />
              BOND {formatGen(Number(KEEPER_BOND_WEI))}
            </label>
          )}
          <button onClick={() => setManual(!manual)} className="btn-outline px-3 py-1 text-[16px] font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            {manual ? "QUEUE" : "MANUAL"}
          </button>
          {dueSources.length > 0 && !manual && (
            <button onClick={sweepAll} className="btn-copper px-3 py-1 text-[16px]" style={{ fontFamily: "var(--font-heading)" }}>
              SWEEP ALL ({dueSources.length})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-2">
          {!manual ? (
            dueSources.length === 0 ? (
              <div className="obs-field p-5"><p className="text-[17px]" style={{ color: "var(--muted-instrument)" }}>No unresolved signals. All source apertures within schedule.</p></div>
            ) : dueSources.map((sid) => {
              const src = sources.find((s) => s.source_id === sid);
              return (
                <div key={sid} className="obs-field flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-[6px] h-[6px] rounded-full animate-signal" style={{ background: "var(--seismic-amber)" }} />
                    <span className="text-[15px] font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>{src?.authority || sid}</span>
                    <span className="text-[12.5px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>{sid}</span>
                  </div>
                  <button onClick={() => sweep(sid)} disabled={sweeping === sid} className="btn-copper px-3 py-1 text-[16px]" style={{ fontFamily: "var(--font-heading)" }}>
                    {sweeping === sid ? "SWEEPING…" : bonded ? "BONDED SWEEP" : "SWEEP"}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="obs-field p-5 space-y-3">
              <p className="text-[16px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--consensus-uv)" }}>Manual Signal Sweep</p>
              <select value={mf.sourceId} onChange={(e) => setMf({ ...mf, sourceId: e.target.value })} className="w-full px-3 py-2 text-[15px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }}>
                <option value="">Select source aperture…</option>
                {sources.map((s) => <option key={s.source_id} value={s.source_id}>{s.authority} ({s.source_id})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={mf.dateFrom} onChange={(e) => setMf({ ...mf, dateFrom: e.target.value })} className="px-3 py-2 text-[15px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
                <input type="date" value={mf.dateTo} onChange={(e) => setMf({ ...mf, dateTo: e.target.value })} className="px-3 py-2 text-[15px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
              </div>
              <textarea value={mf.reason} onChange={(e) => setMf({ ...mf, reason: e.target.value })} placeholder="Reason for manual sweep…" rows={2} className="w-full px-3 py-2 text-[15px]" style={{ background: "var(--void-ink)", border: "1px solid var(--border)", color: "var(--signal-bone)" }} />
              <button onClick={manualSweep} disabled={!mf.sourceId || !mf.reason} className="w-full py-2 text-[17px] font-bold disabled:opacity-40" style={{ fontFamily: "var(--font-heading)", background: "var(--consensus-uv)", color: "white" }}>
                INITIATE MANUAL SWEEP
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="obs-inset p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[16px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--regulatory-copper)" }}>Consensus Lens</p>
              {tx.startedAt && !["idle", "failed"].includes(tx.status) && (
                <span className="text-[13px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>{elapsed}s elapsed</span>
              )}
            </div>
            {tx.status === "idle" ? (
              <p className="text-[16px]" style={{ color: "var(--muted-instrument)" }}>Select a source aperture to begin signal sweep.</p>
            ) : (
              <div className="space-y-2.5">
                <SweepStep label="Wallet signature" active={tx.status === "prompting"} done={tx.status !== "prompting"} />
                <SweepStep label="Transaction submitted" active={tx.status === "submitted"} done={STAGE_ORDER.includes(tx.status) || tx.status === "UNDETERMINED"} />
                {STAGE_ORDER.map((s) => (
                  <SweepStep key={s} label={STAGE_LABEL[s]} active={tx.status === s} done={STAGE_ORDER.indexOf(tx.status) > STAGE_ORDER.indexOf(s)} />
                ))}

                {tx.status === "UNDETERMINED" && (
                  <div className="mt-1 p-2.5" style={{ background: "rgba(212,163,42,.1)", border: "1px solid rgba(212,163,42,.3)" }}>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--seismic-amber)" }}>Validators could not agree — nothing was written.</p>
                    <p className="text-[13px] mt-1" style={{ color: "var(--muted-instrument)" }}>This is not an error. Retry the sweep; a new consensus round will run.</p>
                    {retrySid && <button onClick={() => sweep(retrySid)} className="btn-copper px-3 py-1 text-[14px] mt-2">Retry sweep</button>}
                  </div>
                )}
                {(tx.status === "VALIDATORS_TIMEOUT" || tx.status === "LEADER_TIMEOUT") && (
                  <div className="mt-1 p-2.5" style={{ background: "rgba(212,163,42,.1)", border: "1px solid rgba(212,163,42,.3)" }}>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--seismic-amber)" }}>{tx.status === "VALIDATORS_TIMEOUT" ? "Validators timed out" : "Leader timed out"} — nothing was written.</p>
                    {retrySid && <button onClick={() => sweep(retrySid)} className="btn-copper px-3 py-1 text-[14px] mt-2">Retry sweep</button>}
                  </div>
                )}
                {tx.status === "ACCEPTED" && (
                  <p className="text-[13px]" style={{ color: "var(--seismic-amber)" }}>Result can still change until finalized (appeal window open).</p>
                )}
                {tx.status === "failed" && <p className="text-[16px]" style={{ color: "var(--pressure-red)" }}>{tx.error}</p>}
              </div>
            )}
            {tx.hash && (
              <div className="mt-3">
                <TxHashRibbon
                  hash={tx.hash}
                  status={tx.status === "FINALIZED" ? "confirmed" : tx.status === "failed" ? "failed" : "pending"}
                  label="CHAIN STAMP"
                />
              </div>
            )}
          </div>

          {log.length > 0 && (
            <div className="obs-inset p-3">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] mb-2" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Sweep Log</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {log.map((m, i) => <p key={i} className="text-[12.5px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>{m}</p>)}
              </div>
            </div>
          )}

          <div className="obs-inset p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>Keeper Bonds</p>
              <button onClick={handleChallenge} className="btn-outline px-2 py-1 text-[11.5px]">CHALLENGE A SCAN</button>
            </div>
            <p className="text-[12.5px] mb-2" style={{ color: "var(--muted-instrument)" }}>
              Any keeper can challenge a bonded scan that reported zero alerts by pointing at a later scan of the same source that found real ones — the bond is slashed to the challenger.
            </p>
            {myBonds.length > 0 && (
              <div className="space-y-2">
                {myBonds.map((s) => {
                  const now = Math.floor(Date.now() / 1000);
                  const windowOpen = now < s.challenge_deadline;
                  return (
                    <div key={s.scan_id} className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ border: "1px solid var(--border)" }}>
                      <div>
                        <span className="text-[13px] font-bold" style={{ fontFamily: "var(--font-data)", color: "var(--signal-bone)" }}>{s.scan_id}</span>
                        <span className="text-[11.5px] ml-2" style={{
                          color: s.bond_status === "LOCKED" ? "var(--seismic-amber)" : s.bond_status === "SLASHED" ? "var(--pressure-red)" : "var(--exposure-green)",
                        }}>
                          {s.bond_status}{s.bond_status === "LOCKED" ? (windowOpen ? " · challenge window open" : " · claimable") : ""}
                        </span>
                      </div>
                      {s.bond_status === "LOCKED" && !windowOpen && (
                        <button onClick={() => handleClaim(s.scan_id)} disabled={bondBusy === s.scan_id} className="btn-copper px-2 py-1 text-[12px]">
                          {bondBusy === s.scan_id ? "…" : "CLAIM"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SweepStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[7px] h-[7px] rounded-full" style={{ background: done ? "var(--exposure-green)" : active ? "var(--seismic-amber)" : "var(--instrument-graphite)" }} />
      <span className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-heading)", color: done ? "var(--exposure-green)" : active ? "var(--seismic-amber)" : "var(--muted-instrument)" }}>
        {label}
      </span>
    </div>
  );
}
