"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { getProfilesByOwner } from "@/lib/genlayer/reads";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import WalletPanel from "@/components/shared/WalletPanel";

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
  const { address, connected, connect, client, mode, ready, needsAcknowledgement, acknowledgeGeneratedWallet } = useWallet();
  const { profileId, setProfileId } = useActiveProfile();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!client || !address || !profileId) return;
    // The active profile ID is cached in localStorage and never tied to a
    // specific contract deployment — after a redeploy, IDs restart from
    // "PRF-000001", so a stale cached ID can silently resolve to a different
    // profile. Verify it against the connected wallet's actual owned profiles
    // on every page, not just /profiles, since this chip renders everywhere.
    getProfilesByOwner(client, address)
      .then((owned) => {
        if (!owned.some((p) => p.profile_id === profileId)) {
          setProfileId(owned.length > 0 ? owned[0].profile_id : null);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, address]);

  return (
    <div className="min-h-screen flex flex-col" style={{ position: "relative", zIndex: 1 }}>
      {/* Top nav bar - matches demo nav */}
      <header className="wt-nav">
        <div className="flex items-center gap-4">
          <Link href="/" className="logo">
            <div className="logo-eye">👁</div>
            Watchtower AI
          </Link>
          <div className="nav-net">
            <span className="ndot" />
            GenLayer · StudioNet
          </div>
        </div>

        <div className="nav-r" style={{ position: "relative" }}>
          {mounted && ready && connected ? (
            <>
              <button
                onClick={() => setPanelOpen((v) => !v)}
                className="nav-net"
                style={{ cursor: "pointer" }}
                aria-haspopup="dialog"
                aria-expanded={panelOpen}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: mode === "injected" ? "var(--frost)" : "var(--seismic-amber)", boxShadow: `0 0 8px ${mode === "injected" ? "var(--frost)" : "var(--seismic-amber)"}` }} />
                {mode === "generated" ? "Browser wallet · " : ""}{address?.slice(0, 6)}...{address?.slice(-4)}
              </button>
              {mode === "generated" && (
                <button
                  onClick={connect}
                  className="nav-cta"
                  style={{ background: "rgba(147,90,240,.1)", color: "var(--aurora)", border: "1px solid rgba(147,90,240,.22)", boxShadow: "none", fontSize: "0.75rem" }}
                >
                  Connect wallet
                </button>
              )}
              {panelOpen && <WalletPanel onClose={() => setPanelOpen(false)} />}
            </>
          ) : (
            <button onClick={connect} className="nav-cta">
              Enter Watchtower
            </button>
          )}
        </div>
      </header>

      {mounted && ready && needsAcknowledgement && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2"
          style={{ background: "rgba(212,163,42,.1)", borderBottom: "1px solid rgba(212,163,42,.3)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--seismic-amber)" }}>
            Watchtower generated a browser wallet for you (<span style={{ fontFamily: "var(--font-data)" }}>{address?.slice(0, 6)}...{address?.slice(-4)}</span>).
            It lives only in this browser&apos;s local storage — clearing site data destroys it and it is not
            custody-grade. Export it from the wallet menu before you rely on it.
          </p>
          <button onClick={acknowledgeGeneratedWallet} className="btn-outline px-3 py-1 text-[13px] whitespace-nowrap">
            Understood
          </button>
        </div>
      )}

      {/* Sub-nav with page links */}
      <nav className="wt-subnav">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "active" : ""}
            >
              {item.label}
            </Link>
          );
        })}
        {mounted && profileId && (
          <span className="urg-chip uc-7" style={{ marginLeft: "auto", fontSize: ".55rem" }}>
            <span className="uc-dot" />
            {profileId}
          </span>
        )}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Footer */}
      <div className="wt-footer">
        <p>Compliance intelligence only. Not legal advice.</p>
        <div className="flex items-center gap-3">
          <p>GenLayer Consensus · Keeper-Triggered · No Hidden Backend</p>
          <span className="ndot" />
        </div>
      </div>
    </div>
  );
}
