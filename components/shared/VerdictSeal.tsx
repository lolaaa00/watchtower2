"use client";

interface ConsensusLensProps {
  label: string;
  value: string;
  color?: string;
}

export default function VerdictSeal({ label, value, color = "var(--regulatory-copper)" }: ConsensusLensProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-[60px] h-[60px] rounded-full flex items-center justify-center"
        style={{ border: `2px solid ${color}`, background: `${color}08` }}
      >
        <div
          className="w-[44px] h-[44px] rounded-full flex items-center justify-center"
          style={{ border: `1px solid ${color}25` }}
        >
          <span className="text-[7px] text-center leading-[1.3] uppercase font-bold px-0.5"
            style={{ fontFamily: "var(--font-heading)", color, letterSpacing: "0.03em" }}
          >
            {value.replace(/_/g, "\n")}
          </span>
        </div>
      </div>
      <span className="text-[8px] font-bold uppercase tracking-[0.1em]"
        style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)" }}
      >
        {label}
      </span>
    </div>
  );
}
