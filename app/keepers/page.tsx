"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { getKeeperStats } from "@/lib/genlayer/reads";
import type { KeeperStatsRecord } from "@/lib/types";

const BAND_COLORS: Record<string, string> = {
  OBSERVER: "var(--muted-instrument)",
  SCANNER: "var(--authority-blue)",
  SENTINEL: "var(--seismic-amber)",
  ARCHIVIST: "var(--regulatory-copper)",
  "WATCH CAPTAIN": "var(--consensus-uv)",
};

export default function SignalKeepersPage() {
  const { client, address } = useWallet();
  const [stats, setStats] = useState<KeeperStatsRecord | null>(null);

  useEffect(() => {
    if (!client || !address) return;
    getKeeperStats(client, address).then(setStats).catch(() => {});
  }, [client, address]);

  return (
    <div className="p-5 animate-enter">
      <h1 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-heading)" }}>Signal Keepers</h1>
      <p className="text-[11px] mb-6" style={{ color: "var(--muted-instrument)" }}>
        Wallets maintaining the regulatory signal network. The contract stores the schedule. Keepers trigger the sweep.
      </p>

      {!stats ? (
        <div className="obs-field p-6 text-center"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>Connect wallet to view your keeper signal record.</p></div>
      ) : (
        <div className="max-w-md">
          <div className="obs-field p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[11px]" style={{ fontFamily: "var(--font-data)", color: "var(--signal-bone)" }}>
                {address?.slice(0, 10)}…{address?.slice(-6)}
              </span>
              <span className="indicator" style={{
                background: `${BAND_COLORS[stats.reputation_band] || "var(--muted-instrument)"}12`,
                color: BAND_COLORS[stats.reputation_band] || "var(--muted-instrument)",
              }}>
                {stats.reputation_band}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KeeperInstrument label="Sweeps Triggered" value={stats.scans_triggered} color="var(--authority-blue)" />
              <KeeperInstrument label="Readings Found" value={stats.alerts_found} color="var(--seismic-amber)" />
              <KeeperInstrument label="Duplicates" value={stats.duplicate_scans} color="var(--muted-instrument)" />
              <KeeperInstrument label="Failed" value={stats.failed_scans} color="var(--pressure-red)" />
              <KeeperInstrument label="Signal Points" value={stats.reputation_points} color="var(--consensus-uv)" />
              <KeeperInstrument label="Last Active" value={stats.last_active_at ? new Date(stats.last_active_at * 1000).toLocaleDateString() : "—"} color="var(--faint-parchment)" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeeperInstrument({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="obs-inset p-3">
      <p className="text-[8px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>{label}</p>
      <p className="text-xl font-bold" style={{ fontFamily: "var(--font-display-num)", color }}>{value}</p>
    </div>
  );
}
