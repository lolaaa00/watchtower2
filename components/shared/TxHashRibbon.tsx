"use client";

import { getExplorerTxUrl } from "@/lib/config/env";
import { useState } from "react";

interface ChainStampProps {
  hash: string;
  label?: string;
  status?: "pending" | "confirmed" | "failed";
}

const ST = {
  pending: { color: "var(--seismic-amber)", bg: "rgba(255,179,71,0.06)" },
  confirmed: { color: "var(--exposure-green)", bg: "rgba(89,209,140,0.06)" },
  failed: { color: "var(--pressure-red)", bg: "rgba(229,72,77,0.06)" },
};

export default function TxHashRibbon({ hash, label, status = "confirmed" }: ChainStampProps) {
  const [copied, setCopied] = useState(false);
  const s = ST[status];

  const copy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: s.bg, borderLeft: `2px solid ${s.color}` }}>
      <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: s.color }} />
      {label && <span className="text-[9px] font-bold uppercase shrink-0" style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}>{label}</span>}
      <a
        href={getExplorerTxUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] hover:underline truncate"
        style={{ fontFamily: "var(--font-data)", color: s.color }}
      >
        {hash.slice(0, 12)}…{hash.slice(-8)}
      </a>
      <button
        onClick={copy}
        className="text-[9px] font-bold uppercase shrink-0 ml-auto transition-colors"
        style={{ fontFamily: "var(--font-heading)", color: copied ? "var(--exposure-green)" : "var(--muted-instrument)" }}
      >
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}
