"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { getSources, getContractSummary } from "@/lib/genlayer/reads";
import type { SourceRecord } from "@/lib/types";
import Link from "next/link";

export default function AuthorityFieldPage() {
  const { client, address } = useWallet();
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowTs] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!client) return;
    let active = true;
    getSources(client).then((s) => { if (active) { setSources(s); setLoading(false); } }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client]);

  return (
    <div className="p-5 animate-enter">
      <h1 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-heading)" }}>Authority Field</h1>
      <p className="text-[11px] mb-6" style={{ color: "var(--muted-instrument)" }}>
        Official regulatory sources registered on-chain. Each source aperture has a signal sweep schedule enforced by the contract.
      </p>

      {loading && !sources.length ? (
        <div className="obs-field p-6 text-center"><p className="text-[12px]" style={{ color: "var(--muted-instrument)" }}>Scanning authority field…</p></div>
      ) : sources.length === 0 ? (
        <EmptyAuthorityField address={address} client={client} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sources.map((s) => <SourceAperture key={s.source_id} source={s} nowTs={nowTs} />)}
        </div>
      )}
    </div>
  );
}

function SourceAperture({ source, nowTs }: { source: SourceRecord; nowTs: number }) {
  const isDue = source.active && nowTs >= source.next_due_at && nowTs >= source.cooldown_until;
  const hours = Math.round(source.scan_interval_seconds / 3600);

  return (
    <div className="obs-aperture p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 flex items-center justify-center text-[9px] font-black"
            style={{ fontFamily: "var(--font-heading)", background: isDue ? "rgba(255,179,71,0.12)" : "rgba(75,163,199,0.08)", color: isDue ? "var(--seismic-amber)" : "var(--authority-blue)" }}>
            {source.authority.slice(0, 3).toUpperCase()}
          </div>
          <div>
            <p className="text-[12px] font-bold" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>{source.authority}</p>
            <p className="text-[9px]" style={{ color: "var(--muted-instrument)" }}>{source.jurisdiction} · {source.sector}</p>
          </div>
        </div>
        <span className="indicator" style={{
          background: source.active ? "rgba(89,209,140,0.08)" : "rgba(244,239,229,0.04)",
          color: source.active ? "var(--exposure-green)" : "var(--muted-instrument)",
        }}>
          {source.active ? "LIVE" : "DARK"}
        </span>
      </div>

      <div className="space-y-1">
        <DataRow label="Type" value={source.source_type} />
        <DataRow label="Adapter" value={source.adapter} />
        <DataRow label="Sweep interval" value={`${hours}h`} />
        <DataRow label="Total sweeps" value={String(source.total_scans)} />
        <DataRow label="Impact readings" value={String(source.total_alerts)} />
      </div>

      {isDue && (
        <div className="mt-3 pt-2 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,179,71,0.15)" }}>
          <div className="w-[5px] h-[5px] rounded-full animate-signal" style={{ background: "var(--seismic-amber)" }} />
          <span className="text-[9px] font-bold uppercase" style={{ fontFamily: "var(--font-heading)", color: "var(--seismic-amber)" }}>UNRESOLVED SIGNAL</span>
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span style={{ color: "var(--muted-instrument)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-data)", color: "var(--faint-parchment)" }}>{value}</span>
    </div>
  );
}

function EmptyAuthorityField({ address, client }: { address: string | null; client: any }) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!client || !address) return;
    getContractSummary(client).then((s) => {
      if (s.owner && address && s.owner.toLowerCase() === address.toLowerCase()) {
        setIsOwner(true);
      }
    }).catch(() => {});
  }, [client, address]);

  return (
    <div className="obs-field p-6 text-center">
      <p className="text-[12px] mb-4" style={{ color: "var(--muted-instrument)" }}>
        No source apertures are open yet. The deployer must open official source apertures before signal sweeps can run.
      </p>
      {isOwner ? (
        <Link href="/admin/sources" className="btn-copper px-5 py-2 text-[11px] inline-block" style={{ fontFamily: "var(--font-heading)" }}>
          OPEN AUTHORITY CONTROL
        </Link>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--muted-instrument)" }}>
          Waiting for deployer to open official source apertures.
        </p>
      )}
    </div>
  );
}
