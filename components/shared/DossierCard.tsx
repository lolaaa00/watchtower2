"use client";

import type { ReactNode } from "react";

interface ImpactReadingProps {
  title: string;
  subtitle?: string;
  status?: string;
  severity?: "low" | "medium" | "high" | "critical";
  id?: string;
  meta?: Array<{ label: string; value: string }>;
  children?: ReactNode;
  className?: string;
}

const SEV = {
  low: { color: "var(--authority-blue)", border: "var(--authority-blue)" },
  medium: { color: "var(--seismic-amber)", border: "var(--seismic-amber)" },
  high: { color: "var(--pressure-red)", border: "var(--pressure-red)" },
  critical: { color: "var(--pressure-red)", border: "var(--pressure-red)" },
};

export default function DossierCard({
  title, subtitle, status, severity, id, meta, children, className = "",
}: ImpactReadingProps) {
  const s = severity ? SEV[severity] : SEV.low;

  return (
    <div className={`obs-trace pl-4 pr-4 py-3 transition-all hover:border-l-[var(--regulatory-copper)] ${className}`}
      style={{ borderLeftColor: s.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[12px] font-bold truncate" style={{ fontFamily: "var(--font-heading)", color: "var(--signal-bone)" }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] mt-0.5" style={{ fontFamily: "var(--font-body)", color: "var(--muted-instrument)" }}>{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status && (
            <span className="indicator" style={{ background: `${s.color}18`, color: s.color }}>{status}</span>
          )}
          {id && (
            <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--instrument-graphite)" }}>{id}</span>
          )}
        </div>
      </div>

      {children}

      {meta && meta.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          {meta.map((m) => (
            <div key={m.label} className="text-[9px]">
              <span style={{ color: "var(--muted-instrument)" }}>{m.label}: </span>
              <span style={{ fontFamily: "var(--font-data)", color: "var(--faint-parchment)" }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
