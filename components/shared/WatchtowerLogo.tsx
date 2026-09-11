"use client";

interface LogoProps {
  size?: number;
  className?: string;
}

export default function WatchtowerLogo({ size = 30, className = "" }: LogoProps) {
  return (
    <div
      className={`logo-eye ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      👁
    </div>
  );
}
