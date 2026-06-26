"use client";

import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { env, getExplorerAddressUrl } from "@/lib/config/env";

export default function TopCommandStrip() {
  const { address, connected, connect, disconnect } = useWallet();
  const { profileId } = useActiveProfile();

  return (
    <header
      className="fixed top-0 left-[220px] right-0 h-16 z-40 flex items-center justify-between px-6"
      style={{
        background: "rgba(11, 15, 25, 0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-4">
        {profileId && (
          <div className="flex items-center gap-2">
            <span className="pill" style={{ background: "rgba(212,165,74,0.12)", color: "var(--brass-light)" }}>
              {profileId}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {env.contractAddress && (
          <a
            href={getExplorerAddressUrl(env.contractAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono px-2.5 py-1 rounded-md transition-colors"
            style={{ color: "var(--ash)", background: "rgba(255,255,255,0.03)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brass-light)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ash)")}
          >
            {env.contractAddress.slice(0, 6)}…{env.contractAddress.slice(-4)}
          </a>
        )}

        {connected ? (
          <button
            onClick={disconnect}
            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-[12px] transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brass)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--emerald)" }} />
            <span className="font-mono text-[11px]" style={{ color: "var(--bone)" }}>
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
          </button>
        ) : (
          <button onClick={connect} className="btn-primary px-4 py-1.5 text-[12px] font-semibold">
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
