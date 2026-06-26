"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", icon: "⌘", label: "Command Center" },
  { href: "/profiles", icon: "◈", label: "Watch Profiles" },
  { href: "/sources", icon: "◉", label: "Source Archive" },
  { href: "/scan", icon: "⟐", label: "Scan Room" },
  { href: "/alerts", icon: "◬", label: "Alert Dossiers" },
  { href: "/tribunal", icon: "⚖", label: "Tribunal" },
  { href: "/keepers", icon: "⬡", label: "Keeper Board" },
  { href: "/ledger", icon: "≡", label: "Chain Ledger" },
];

export default function SignalRail() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed left-0 top-0 bottom-0 w-[220px] z-50 flex flex-col"
      style={{ background: "var(--deep-navy)", borderRight: "1px solid var(--border)" }}
    >
      {/* Logo */}
      <div className="px-5 h-16 flex items-center gap-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
          style={{
            background: "linear-gradient(135deg, var(--brass), var(--brass-dark))",
            color: "var(--obsidian)",
          }}
        >
          W
        </div>
        <div>
          <p className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--bone)" }}>
            Watchtower
          </p>
          <p className="text-[9px] font-mono" style={{ color: "var(--ash)" }}>
            regulatory intelligence
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-150"
              style={{
                background: active ? "rgba(212, 165, 74, 0.1)" : "transparent",
                color: active ? "var(--brass-light)" : "var(--silver)",
                fontWeight: active ? 600 : 400,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  e.currentTarget.style.color = "var(--bone)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--silver)";
                }
              }}
            >
              <span className="text-sm w-5 text-center opacity-70">{item.icon}</span>
              <span>{item.label}</span>
              {active && (
                <span
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--brass)" }}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse-slow" style={{ background: "var(--emerald)" }} />
          <span className="text-[10px] font-mono" style={{ color: "var(--ash)" }}>
            StudioNet · 61999
          </span>
        </div>
      </div>
    </nav>
  );
}
