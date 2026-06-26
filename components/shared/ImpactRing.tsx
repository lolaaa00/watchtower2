"use client";

import { RELEVANCE_COLORS, MATERIALITY_COLORS, URGENCY_COLORS } from "@/lib/constants/enums";

interface MagnitudeDialProps {
  relevance: string;
  materiality: string;
  urgency: string;
  confidence: number;
  size?: number;
}

export default function ImpactRing({
  relevance, materiality, urgency, confidence, size = 110,
}: MagnitudeDialProps) {
  const cx = size / 2;
  const r1 = size / 2 - 6;
  const r2 = size / 2 - 17;
  const r3 = size / 2 - 28;

  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  const c3 = 2 * Math.PI * r3;

  const relColor = RELEVANCE_COLORS[relevance] || "#1A2028";
  const matColor = MATERIALITY_COLORS[materiality] || "#1A2028";
  const urgColor = URGENCY_COLORS[urgency] || "#1A2028";

  const relS = { NOT_RELEVANT: 0, LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, CRITICAL: 1 }[relevance] ?? 0.5;
  const matS = { NON_MATERIAL: 0, POTENTIALLY_MATERIAL: 0.33, MATERIAL: 0.66, HIGHLY_MATERIAL: 1 }[materiality] ?? 0.5;
  const urgS = { WATCH_ONLY: 0.2, REVIEW_WITHIN_30_DAYS: 0.4, REVIEW_WITHIN_7_DAYS: 0.6, IMMEDIATE_REVIEW: 0.8, EMERGENCY_ACTION: 1 }[urgency] ?? 0.5;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[{ r: r1, c: c1, color: relColor, score: relS }, { r: r2, c: c2, color: matColor, score: matS }, { r: r3, c: c3, color: urgColor, score: urgS }].map((ring, i) => (
        <g key={i}>
          <circle cx={cx} cy={cx} r={ring.r} fill="none" stroke="rgba(244,239,229,0.04)" strokeWidth="5" />
          <circle
            cx={cx} cy={cx} r={ring.r} fill="none" stroke={ring.color} strokeWidth="5"
            strokeDasharray={ring.c} strokeDashoffset={ring.c * (1 - ring.score)}
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}
            style={{ filter: `drop-shadow(0 0 3px ${ring.color}40)` }}
          />
        </g>
      ))}
      <text x={cx} y={cx - 1} textAnchor="middle" fill="var(--signal-bone)" fontSize="18" fontWeight="700" style={{ fontFamily: "var(--font-display-num)" }}>
        {confidence}
      </text>
      <text x={cx} y={cx + 12} textAnchor="middle" fill="var(--muted-instrument)" fontSize="6" fontWeight="700" letterSpacing="0.12em" style={{ fontFamily: "var(--font-heading)" }}>
        CONFIDENCE
      </text>
    </svg>
  );
}
