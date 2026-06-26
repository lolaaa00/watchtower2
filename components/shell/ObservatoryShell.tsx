"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { env, getExplorerAddressUrl } from "@/lib/config/env";
import { type ReactNode, useSyncExternalStore } from "react";
import WatchtowerLogo from "@/components/shared/WatchtowerLogo";

const NAV = [
  { href: "/", label: "Observatory Deck" },
  { href: "/profiles", label: "Exposure Map" },
  { href: "/sources", label: "Authority Field" },
  { href: "/scan", label: "Signal Sweep" },
  { href: "/alerts", label: "Impact Readings" },
  { href: "/tribunal", label: "Second Reading" },
  { href: "/keepers", label: "Signal Keepers" },
  { href: "/ledger", label: "Chain Ledger" },
];

export default function ObservatoryShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { address, connected, connect, disconnect } = useWallet();
  const { profileId } = useActiveProfile();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── TOP: Observatory Status Band ── */}
      <header
        className="h-10 flex items-center justify-between px-5 shrink-0 z-50"
        style={{ background: "var(--observatory-black)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <WatchtowerLogo size={24} />
            <span className="text-[11px] font-bold tracking-wide uppercase" style={{ fontFamily: "var(--font-heading)", color: "var(--ash-paper)" }}>
              Watchtower
            </span>
          </Link>
          <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>
            StudioNet · {env.chainId}
          </span>
          {env.contractAddress && (
            <a
              href={getExplorerAddressUrl(env.contractAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] hover:underline"
              style={{ fontFamily: "var(--font-data)", color: "var(--authority-blue)" }}
            >
              {env.contractAddress.slice(0, 8)}…{env.contractAddress.slice(-6)}
            </a>
          )}
          {mounted && profileId && (
            <span className="indicator" style={{ background: "rgba(192,106,61,0.12)", color: "var(--regulatory-copper)" }}>
              {profileId}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mounted && connected ? (
            <>
              <div
                className="flex items-center gap-2 px-3 py-1 text-[10px]"
                style={{ border: "1px solid var(--border)", color: "var(--ash-paper)", fontFamily: "var(--font-data)" }}
              >
                <span className="w-[6px] h-[6px] rounded-full" style={{ background: "var(--exposure-green)" }} />
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </div>
              <button
                onClick={disconnect}
                className="px-2 py-1 text-[9px] font-bold uppercase transition-colors"
                style={{ fontFamily: "var(--font-heading)", color: "var(--muted-instrument)", border: "1px solid var(--border)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--pressure-red)"; e.currentTarget.style.borderColor = "var(--pressure-red)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-instrument)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={connect} className="btn-copper px-3 py-1 text-[10px]" style={{ fontFamily: "var(--font-heading)" }}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* ── NAVIGATION BAND ── */}
      <nav
        className="h-9 flex items-center gap-0 px-4 shrink-0 overflow-x-auto"
        style={{ background: "var(--void-ink)", borderBottom: "1px solid var(--border)" }}
      >
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 h-full flex items-center text-[11px] font-semibold transition-colors shrink-0 relative"
              style={{
                fontFamily: "var(--font-heading)",
                color: active ? "var(--regulatory-copper)" : "var(--muted-instrument)",
              }}
            >
              {item.label}
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px]" style={{ background: "var(--regulatory-copper)" }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* ── BOTTOM: Chain Stamp Strip ── */}
      <footer
        className="h-7 flex items-center justify-between px-5 shrink-0"
        style={{ background: "var(--observatory-black)", borderTop: "1px solid var(--border)" }}
      >
        <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>
          Compliance intelligence only. Not legal advice.
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[9px]" style={{ fontFamily: "var(--font-data)", color: "var(--muted-instrument)" }}>
            GenLayer Consensus · Keeper-Triggered · No Hidden Backend
          </span>
          <div className="w-[6px] h-[6px] rounded-full animate-signal" style={{ background: "var(--exposure-green)" }} />
        </div>
      </footer>
    </div>
  );
}
