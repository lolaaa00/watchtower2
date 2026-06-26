"use client";

interface LogoProps {
  size?: number;
  className?: string;
}

export default function WatchtowerLogo({ size = 28, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Base platform */}
      <path d="M12 56 L24 36 L40 36 L52 56 Z" fill="#1A2028" stroke="#C06A3D" strokeWidth="1.5" />

      {/* Tower body */}
      <rect x="26" y="14" width="12" height="22" rx="1" fill="#101A26" stroke="#C06A3D" strokeWidth="1.2" />

      {/* Tower top — observatory dome */}
      <path d="M24 14 Q32 4 40 14 Z" fill="#C06A3D" />

      {/* Signal beacon — top light */}
      <circle cx="32" cy="8" r="3" fill="#FFB347" />
      <circle cx="32" cy="8" r="5" fill="none" stroke="#FFB347" strokeWidth="0.7" opacity="0.5" />
      <circle cx="32" cy="8" r="8" fill="none" stroke="#FFB347" strokeWidth="0.4" opacity="0.25" />

      {/* Signal waves emanating left */}
      <path d="M18 18 Q14 14 18 10" fill="none" stroke="#4BA3C7" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M14 20 Q9 14 14 8" fill="none" stroke="#4BA3C7" strokeWidth="0.8" strokeLinecap="round" opacity="0.35" />

      {/* Signal waves emanating right */}
      <path d="M46 18 Q50 14 46 10" fill="none" stroke="#4BA3C7" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M50 20 Q55 14 50 8" fill="none" stroke="#4BA3C7" strokeWidth="0.8" strokeLinecap="round" opacity="0.35" />

      {/* Window slits on tower */}
      <rect x="30" y="18" width="4" height="2" rx="0.5" fill="#FFB347" opacity="0.7" />
      <rect x="30" y="23" width="4" height="2" rx="0.5" fill="#FFB347" opacity="0.5" />
      <rect x="30" y="28" width="4" height="2" rx="0.5" fill="#FFB347" opacity="0.3" />

      {/* Ground line */}
      <line x1="6" y1="56" x2="58" y2="56" stroke="#C06A3D" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
