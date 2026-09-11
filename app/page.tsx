"use client";

import { useWallet } from "@/lib/hooks/useWallet";
import { useActiveProfile } from "@/lib/hooks/useActiveProfile";
import { useEffect, useState, useRef } from "react";
import { getContractSummary, getProfilesByOwner, getDueSources, getAlertsForProfile } from "@/lib/genlayer/reads";
import type { ContractSummary, WatchProfile, AlertRecord } from "@/lib/types";
import Link from "next/link";

function useScrollReveal(key: string | number = 0) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll(".reveal:not(.on)");
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("on"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    els.forEach((el) => {
      const sibs = el.parentElement?.querySelectorAll(".reveal");
      if (sibs && sibs.length > 1) {
        const i = Array.from(sibs).indexOf(el);
        (el as HTMLElement).style.transitionDelay = `${i * 0.09}s`;
      }
      obs.observe(el);
    });
    return () => obs.disconnect();
  }, [key]);
  return ref;
}

export default function ObservatoryDeck() {
  const { connected, address, client, connect } = useWallet();
  const { profileId, setProfileId } = useActiveProfile();
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [dueSources, setDueSources] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const revealKey = `${connected}-${profiles.length}-${alerts.length}`;
  const revealRef = useScrollReveal(revealKey);

  useEffect(() => {
    if (!client) return;
    getContractSummary(client).then(setSummary).catch((e) => console.warn("summary read failed:", e));
    if (address) {
      getProfilesByOwner(client, address).then((p) => {
        setProfiles(p);
        const stillOwned = profileId && p.some((x) => x.profile_id === profileId);
        if (!stillOwned) setProfileId(p.length > 0 ? p[0].profile_id : null);
      }).catch((e) => console.warn("profiles read failed:", e));
      getDueSources(client, Math.floor(Date.now() / 1000)).then(setDueSources).catch((e) => console.warn("due sources read failed:", e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, address]);

  useEffect(() => {
    if (!client || !profileId) return;
    getAlertsForProfile(client, profileId, 0, 5).then(setAlerts).catch(() => {});
  }, [client, profileId]);

  if (!connected) {
    return (
      <div ref={revealRef}>
        {/* Alert Ticker */}
        <div className="ticker">
          <div className="ticker-lbl"><span className="t-alert-dot" />Live Alerts</div>
          <div className="ticker-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
              <div key={i} className="t-item">
                <span className="ti-source">{t.source}</span>
                <span className="ti-label">{t.label}</span>
                <span className={`ti-urg ${t.urgClass}`}>{t.urg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hero */}
        <section className="hero">
          <div className="hero-badge">
            <span className="badge-dot" />
            GenLayer Regulatory Consensus Layer · StudioNet
          </div>
          <h1 className="ht">
            <span className="ln"><span className="w" style={{ animationDelay: ".15s" }}>Regulatory</span></span>
            <span className="ln"><span className="gw" style={{ animationDelay: ".38s" }}>intelligence,</span></span>
            <span className="ln"><span className="w" style={{ animationDelay: ".62s" }}>on consensus.</span></span>
          </h1>
          <p className="hero-sub">
            Watchtower AI scans official regulatory sources and uses <span className="hl">GenLayer validators</span> to judge relevance, materiality, and urgency for your specific company profile - on-chain.
          </p>
          <div className="hero-btns">
            <button onClick={connect} className="btn btn-p">Enter Watchtower <span className="arr">→</span></button>
            <a href="#consensus" className="btn btn-g">How Consensus Works</a>
          </div>
        </section>

        {/* Alert Console */}
        <div className="divider" />
        <div className="sec" id="alerts">
          <div className="reveal">
            <div className="sec-lbl">Alert Console</div>
            <h2 className="st">Not just updates. <span className="gs">Verdicts.</span></h2>
            <p className="sec-sub">Every alert was judged by independent GenLayer validators - not flagged by a keyword match. Source-attested, consensus-backed, on-chain.</p>
          </div>
          <div className="console-wrap reveal">
            <div className="console-inner">
              <div className="console-header">
                <div>
                  <div className="ch-title">Regulatory Impact Console</div>
                  <div className="ch-sub">Watch Profile: FinServe Corp · 6 active sources · GenLayer StudioNet</div>
                </div>
                <div className="ch-live"><span className="live-dot" />3 new alerts today</div>
              </div>
              {DEMO_ALERTS.map((a, i) => (
                <div key={i} className={`alert-row ${a.rowClass}`}>
                  <div className={`severity-orb ${a.orbClass}`}>{a.icon}</div>
                  <div>
                    <div className="alert-source">{a.source}</div>
                    <div className="alert-title">{a.title}</div>
                    <div className="alert-company">{a.company}</div>
                  </div>
                  <div className={`urg-chip ${a.urgChipClass}`}><span className="uc-dot" />{a.urgLabel}</div>
                  <div className={`mat-chip ${a.matClass}`}>{a.matLabel}</div>
                  <div className="alert-tx">{a.tx}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scanner */}
        <div className="divider" />
        <div className="sec" id="scanner">
          <div className="reveal">
            <div className="sec-lbl">Keeper-Triggered Scanner</div>
            <h2 className="st">Sources due. <span className="gs">Trigger the scan.</span></h2>
            <p className="sec-sub">The contract stores scan schedules. Anyone can trigger a due scan. Every scan has on-chain transaction proof - no hidden backend, no central scheduler.</p>
          </div>
          <div className="scan-grid">
            {DEMO_SCANS.map((s, i) => (
              <div key={i} className="scan-card reveal">
                <div className="scan-due"><span className={s.dueClass}>{s.dueLabel}</span></div>
                <div className="scan-source">{s.source}</div>
                <div className="scan-url">{s.url}</div>
                <div className="scan-interval">{s.interval}</div>
                <button className={`scan-btn ${s.btnClass}`}>{s.btnLabel}</button>
              </div>
            ))}
          </div>
        </div>

        {/* Consensus Verdict */}
        <div className="divider" />
        <div className="sec" id="consensus">
          <div className="reveal">
            <div className="sec-lbl">Consensus Adjudication</div>
            <h2 className="st">Three validators. <span className="gs">One verdict.</span></h2>
            <p className="sec-sub">GenLayer validators independently judge relevance, materiality, urgency, and required action. This is the subjective work that no deterministic contract can do.</p>
          </div>
          <div className="verdict-wrap reveal">
            <div className="verdict-header">
              <div>
                <div className="vh-title">Consensus Verdict - SEC Cybersecurity Rule · Alert #AL-0047</div>
                <div className="vh-id">Source: sec.gov/rules/final/2023 · Profile: FinServe Corp · 3/3 validators · StudioNet</div>
              </div>
              <div className="urg-chip uc-em" style={{ height: "fit-content" }}><span className="uc-dot" />Emergency · Consensus 94%</div>
            </div>
            <div className="verdict-body">
              <div className="vb-left">
                <div className="v-panel-lbl">Verdict Fields</div>
                <div className="vf-grid">
                  <div className="vf-item"><div className="vf-label">Urgency</div><div className="vf-val vv-em">EMERGENCY</div></div>
                  <div className="vf-item"><div className="vf-label">Materiality</div><div className="vf-val vv-mat">HIGHLY MATERIAL</div></div>
                  <div className="vf-item"><div className="vf-label">Update Type</div><div className="vf-val vv-fin">BINDING RULE</div></div>
                  <div className="vf-item"><div className="vf-label">Review Team</div><div className="vf-val vv-frost">Legal + Compliance</div></div>
                </div>
                <div className="v-panel-lbl">Source Evidence</div>
                <div className="source-item">
                  <span className="src-tier st-prim">Primary</span>
                  <div>
                    <div className="src-text">SEC Final Rule - Cybersecurity Risk Management, Strategy, Governance, and Incident Disclosure. Effective date confirmed for December 15, 2023. Mandatory for all reporting companies.</div>
                    <span className="src-url">sec.gov/rules/final/2023/33-11216.pdf</span>
                  </div>
                </div>
                <div className="source-item">
                  <span className="src-tier st-sec">Secondary</span>
                  <div>
                    <div className="src-text">SEC press release confirms enforcement timeline and compliance scope for registered entities, including financial services firms.</div>
                    <span className="src-url">sec.gov/news/press-release/2023-139</span>
                  </div>
                </div>
                <div style={{ marginTop: "1.25rem" }}>
                  <div className="v-panel-lbl">Recommended Action</div>
                  <div style={{ background: "rgba(3,4,44,.7)", border: "1px solid rgba(248,151,254,.15)", borderRadius: 6, padding: "1rem 1.125rem", fontSize: ".9375rem", color: "var(--parch2)", lineHeight: 1.6 }}>
                    Immediate legal and compliance review required. Assess current cybersecurity disclosure procedures against Final Rule requirements. Board-level reporting obligations apply. Deadline: December 15, 2023.
                  </div>
                </div>
              </div>
              <div className="vb-right">
                <div className="v-panel-lbl">Validator Deliberation</div>
                {VALIDATORS.map((v) => (
                  <div key={v.id} className="val-item">
                    <div className={`val-avatar ${v.avatarClass}`}>{v.id}</div>
                    <div><div className="val-name">{v.name}</div><div className="val-id">{v.addr} · Stake: {v.stake} GEN</div></div>
                    <div style={{ textAlign: "right" }}><div className="val-verdict vv-agree">EMERGENCY · {v.score}</div><div className="val-bar"><div className="val-fill" style={{ width: `${v.score}%` }} /></div></div>
                  </div>
                ))}
                <div className="consensus-final">
                  <div className="cf-verdict">🔴 EMERGENCY - ACT NOW</div>
                  <div className="cf-conf">Consensus: <span>94%</span> · 3/3 validators aligned · Stored on-chain</div>
                </div>
                <div style={{ marginTop: "1.25rem", padding: "1rem 1.125rem", background: "rgba(3,4,44,.7)", border: "1px solid rgba(147,90,240,.12)", borderRadius: 6 }}>
                  <div style={{ fontFamily: "var(--font-data)", fontSize: ".58rem", letterSpacing: ".14em", textTransform: "uppercase" as const, color: "rgba(197,249,252,.35)", marginBottom: ".625rem" }}>Transaction Proof</div>
                  <div style={{ fontFamily: "var(--font-data)", fontSize: ".7rem", color: "rgba(197,249,252,.55)" }}>
                    TX: 0x4a7f1c8e...d291<br />Block: 14,847,291 · StudioNet<br />Contract: WatchtowerRegulatoryLayer
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Watch Profiles */}
        <div className="divider" />
        <div className="sec" id="profiles">
          <div className="reveal">
            <div className="sec-lbl">Watch Profiles</div>
            <h2 className="st">Scanned against <span className="gs">your context.</span></h2>
            <p className="sec-sub">Validators don&apos;t just read regulations. They judge whether each update applies to your specific company profile - sector, jurisdiction, operations.</p>
          </div>
          <div className="profile-grid">
            {DEMO_PROFILES.map((p, i) => (
              <div key={i} className="profile-card reveal">
                <div className="pc-sector">{p.sector}</div>
                <div className="pc-name">{p.name}</div>
                <div className="pc-desc">{p.desc}</div>
                <div className="pc-stats">
                  <span className="pc-stat ps-active">Active</span>
                  <span className="pc-stat ps-sources">{p.sources} sources</span>
                  <span className="pc-stat ps-alerts">{p.alerts} alert{p.alerts !== 1 ? "s" : ""}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Why GenLayer */}
        <div className="divider" />
        <div className="sec" id="why">
          <div className="reveal">
            <div className="sec-lbl">Why This Requires GenLayer</div>
            <h2 className="st">A crawler finds updates. <span className="gs">Watchtower judges them.</span></h2>
            <p className="sec-sub">Deterministic contracts can store regulatory links. Only GenLayer Intelligent Contracts can fetch official source data and reach consensus on subjective materiality.</p>
          </div>
          <div className="why-grid">
            <div className="wc wc-trad reveal">
              <div className="wc-lbl wl-t">Normal Compliance Monitoring</div>
              {WHY_TRAD.map((t, i) => (
                <div key={i} className="wi"><span className="wim" style={{ color: "rgba(197,249,252,.3)" }}>×</span><div className="wit wit-t">{t}</div></div>
              ))}
            </div>
            <div className="wc wc-wt reveal">
              <div className="wc-lbl wl-w">Watchtower AI · GenLayer Protocol</div>
              {WHY_WT.map((w, i) => (
                <div key={i} className="wi">
                  <span className="wim" style={{ color: w.color }}>✦</span>
                  <div><div className="wit wit-w">{w.text}</div><span className={`wtag ${w.tagClass}`}>{w.tag}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="fcta reveal">
          <div className="fcta-i">
            <h2>Stop missing what <span className="gs2">matters to you.</span></h2>
            <p>Watchtower AI turns regulatory noise into consensus-backed verdicts. Official sources. Validator judgment. On-chain proof. Built on GenLayer.</p>
            <button onClick={connect} className="btn btn-p">Enter the Watchtower <span className="arr">→</span></button>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected state ──
  const activeProfile = profiles.find((p) => p.profile_id === profileId);

  return (
    <div ref={revealRef}>
      {/* Ticker with live data */}
      {alerts.length > 0 && (
        <div className="ticker">
          <div className="ticker-lbl"><span className="t-alert-dot" />Live Alerts</div>
          <div className="ticker-track">
            {[...alerts, ...alerts].map((a, i) => (
              <div key={i} className="t-item">
                <span className="ti-source">{a.authority}</span>
                <span className="ti-label">{a.document_title}</span>
                <span className={`ti-urg ${urgencyTickerClass(a.urgency)}`}>{formatUrgency(a.urgency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard */}
      <div className="sec" style={{ padding: "3rem 2rem" }}>
        <div className="reveal">
          <div className="sec-lbl">Observatory Deck</div>
          <h2 className="st">{activeProfile?.company_name || "Welcome"}. <span className="gs">Live overview.</span></h2>
          {profiles.length > 1 && (
            <select
              value={profileId || ""}
              onChange={(e) => setProfileId(e.target.value)}
              style={{ fontFamily: "var(--font-data)", fontSize: ".7rem", background: "rgba(3,4,44,.7)", border: "1px solid rgba(147,90,240,.15)", color: "var(--parch2)", padding: ".35rem .75rem", borderRadius: 4, marginTop: ".5rem" }}
            >
              {profiles.map((p) => <option key={p.profile_id} value={p.profile_id}>{p.company_name}</option>)}
            </select>
          )}
        </div>

        {/* Instrument readings as verdict-style fields */}
        <div className="vf-grid reveal" style={{ marginTop: "2rem", gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="vf-item"><div className="vf-label">Unresolved Signals</div><div className="vf-val vv-em">{dueSources.length}</div></div>
          <div className="vf-item"><div className="vf-label">Open Readings</div><div className="vf-val vv-mat">{alerts.filter((a) => a.status === "OPEN").length}</div></div>
          <div className="vf-item"><div className="vf-label">Authority Sources</div><div className="vf-val vv-frost">{summary?.total_sources || 0}</div></div>
          <div className="vf-item"><div className="vf-label">Signal Sweeps</div><div className="vf-val vv-fin">{summary?.total_scans || 0}</div></div>
        </div>

        {/* Scan line */}
        <div className="animate-sweep" style={{ margin: "2rem 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Due sources */}
          <div className="reveal">
            <div className="v-panel-lbl">Unresolved Signals</div>
            {dueSources.length === 0 ? (
              <div className="vf-item"><div className="src-text">No sources due. Manual sweep available for urgent regulatory tremors.</div></div>
            ) : (
              <div className="scan-grid" style={{ gridTemplateColumns: "1fr", marginTop: 0 }}>
                {dueSources.map((sid) => (
                  <div key={sid} className="scan-card" style={{ padding: "1rem 1.25rem" }}>
                    <div className="scan-due"><span className="sd-now">Due Now</span></div>
                    <div className="scan-source" style={{ fontSize: ".9rem", marginBottom: 0 }}>{sid}</div>
                  </div>
                ))}
                <Link href="/scan" className="btn btn-p" style={{ justifyContent: "center", padding: ".625rem 1rem", fontSize: ".8125rem" }}>
                  Run Signal Sweep <span className="arr">→</span>
                </Link>
              </div>
            )}
          </div>

          {/* Recent alerts */}
          <div className="reveal">
            <div className="v-panel-lbl">Recent Impact Readings</div>
            {alerts.length === 0 ? (
              <div className="vf-item"><div className="src-text">No impact readings recorded for this exposure map.</div></div>
            ) : (
              <div className="console-wrap" style={{ marginTop: 0 }}>
                <div className="console-inner">
                  {alerts.slice(0, 4).map((a) => (
                    <Link key={a.alert_id} href={`/alerts/${a.alert_id}`} className={`alert-row ${alertRowClass(a.urgency)}`} style={{ gridTemplateColumns: "auto 1fr auto", textDecoration: "none" }}>
                      <div className={`severity-orb ${alertOrbClass(a.urgency)}`}>{alertIcon(a.urgency)}</div>
                      <div>
                        <div className="alert-source">{a.authority} · {a.jurisdiction}</div>
                        <div className="alert-title">{a.document_title}</div>
                      </div>
                      <div className={`urg-chip ${alertUrgChipClass(a.urgency)}`}><span className="uc-dot" />{formatUrgency(a.urgency)}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {alerts.length > 0 && (
              <Link href="/alerts" className="btn btn-g" style={{ marginTop: "1rem", justifyContent: "center", width: "100%", fontSize: ".8125rem" }}>
                View All Readings <span className="arr">→</span>
              </Link>
            )}
          </div>
        </div>

        {profiles.length === 0 && (
          <div className="fcta reveal" style={{ margin: "3rem auto 0", padding: "3rem 2rem" }}>
            <div className="fcta-i">
              <h2>Create your <span className="gs2">exposure map.</span></h2>
              <p>Watchtower needs your company profile to judge whether regulatory tremors affect your operations.</p>
              <Link href="/profiles" className="btn btn-p">Create Exposure Map <span className="arr">→</span></Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function urgencyTickerClass(u: string) {
  if (u.includes("EMERGENCY")) return "u-em";
  if (u.includes("IMMEDIATE")) return "u-im";
  if (u.includes("7")) return "u-7";
  if (u.includes("30")) return "u-30";
  return "u-w";
}
function formatUrgency(u: string) {
  if (u.includes("EMERGENCY")) return "Emergency";
  if (u.includes("IMMEDIATE")) return "Immediate";
  if (u.includes("7")) return "7 Days";
  if (u.includes("30")) return "30 Days";
  return "Watch Only";
}
function alertRowClass(u: string) {
  if (u.includes("EMERGENCY")) return "ar-em";
  if (u.includes("IMMEDIATE")) return "ar-im";
  if (u.includes("7")) return "ar-7";
  if (u.includes("30")) return "ar-30";
  return "ar-w";
}
function alertOrbClass(u: string) {
  if (u.includes("EMERGENCY")) return "so-em";
  if (u.includes("IMMEDIATE")) return "so-im";
  if (u.includes("7")) return "so-7";
  if (u.includes("30")) return "so-30";
  return "so-w";
}
function alertIcon(u: string) {
  if (u.includes("EMERGENCY")) return "🚨";
  if (u.includes("IMMEDIATE")) return "⚡";
  if (u.includes("7")) return "⚠";
  if (u.includes("30")) return "📋";
  return "👁";
}
function alertUrgChipClass(u: string) {
  if (u.includes("EMERGENCY")) return "uc-em";
  if (u.includes("IMMEDIATE")) return "uc-im";
  if (u.includes("7")) return "uc-7";
  if (u.includes("30")) return "uc-30";
  return "uc-w";
}

// ── Demo data (landing page) ──

const TICKER_ITEMS = [
  { source: "SEC", label: "New cybersecurity disclosure rules - effective Q1 2025", urg: "Emergency", urgClass: "u-em" },
  { source: "FDA", label: "AI-assisted medical device guidance update", urg: "7 Days", urgClass: "u-7" },
  { source: "FCA", label: "Consumer duty implementation - financial firms", urg: "Immediate", urgClass: "u-im" },
  { source: "CFPB", label: "Open banking rule finalized - FDATA compliance", urg: "30 Days", urgClass: "u-30" },
  { source: "FINRA", label: "AI in research recommendation guidance", urg: "Watch Only", urgClass: "u-w" },
  { source: "ESMA", label: "MiCA implementing regulations - crypto assets", urg: "7 Days", urgClass: "u-7" },
];

const DEMO_ALERTS = [
  { rowClass: "ar-em", orbClass: "so-em", icon: "🚨", source: "SEC · sec.gov/rules/final", title: "Cybersecurity Risk Management - Final Rule Effective Date Confirmed", company: "FinServe Corp · Financial Services · Directly applies to reporting companies", urgChipClass: "uc-em", urgLabel: "Emergency", matClass: "mc-hi", matLabel: "Highly Material", tx: "0x4a7f...c291" },
  { rowClass: "ar-im", orbClass: "so-im", icon: "⚡", source: "FCA · fca.org.uk/publications", title: "Consumer Duty - Enforcement Actions Begin for Financial Firms", company: "FinServe Corp · UK-regulated entity · Immediate compliance review required", urgChipClass: "uc-im", urgLabel: "Immediate", matClass: "mc-hi", matLabel: "Highly Material", tx: "0x9c2a...f847" },
  { rowClass: "ar-7", orbClass: "so-7", icon: "⚠", source: "CFPB · consumerfinance.gov", title: "Open Banking Rule Finalized - Section 1033 Implementation Timeline", company: "FinServe Corp · Applies to covered entities handling consumer financial data", urgChipClass: "uc-7", urgLabel: "7 Days", matClass: "mc-mat", matLabel: "Material", tx: "0x1b3e...a032" },
  { rowClass: "ar-30", orbClass: "so-30", icon: "📋", source: "FINRA · finra.org/rules-guidance", title: "Regulatory Notice 24-09: AI Use in Research and Recommendations", company: "FinServe Corp · Guidance applicable to broker-dealer operations", urgChipClass: "uc-30", urgLabel: "30 Days", matClass: "mc-pot", matLabel: "Potentially Material", tx: "0x7f9b...d514" },
  { rowClass: "ar-w", orbClass: "so-w", icon: "👁", source: "ESMA · esma.europa.eu", title: "MiCA Delegated Regulations - Draft Technical Standards Published", company: "FinServe Corp · Indirect exposure through crypto custody operations", urgChipClass: "uc-w", urgLabel: "Watch Only", matClass: "mc-non", matLabel: "Non-Material", tx: "0x2d9e...a841" },
];

const DEMO_SCANS = [
  { dueClass: "sd-now", dueLabel: "Due Now", source: "SEC · EDGAR", url: "sec.gov/cgi-bin/browse-edgar", interval: "Weekly scan · 6 alerts created · Last scan 7 days ago", btnClass: "sb-active", btnLabel: "⚡ Run Scan Now" },
  { dueClass: "sd-now", dueLabel: "Due Now", source: "FCA · Handbook", url: "handbook.fca.org.uk/updates", interval: "Bi-weekly scan · 3 alerts created · Last scan 14 days ago", btnClass: "sb-active", btnLabel: "⚡ Run Scan Now" },
  { dueClass: "sd-soon", dueLabel: "Due in 2 Days", source: "CFPB · Rules", url: "consumerfinance.gov/rules-policy", interval: "Weekly scan · 2 alerts created · Last scan 5 days ago", btnClass: "sb-idle", btnLabel: "Schedule Reminder" },
  { dueClass: "sd-soon", dueLabel: "Due in 4 Days", source: "FINRA · Guidance", url: "finra.org/rules-guidance/notices", interval: "Weekly scan · 1 alert created · Last scan 3 days ago", btnClass: "sb-idle", btnLabel: "Schedule Reminder" },
  { dueClass: "sd-later", dueLabel: "Due in 8 Days", source: "FDA · Guidance", url: "fda.gov/regulatory-information", interval: "Bi-weekly scan · 4 alerts created · Last scan 6 days ago", btnClass: "sb-idle", btnLabel: "View Schedule" },
  { dueClass: "sd-later", dueLabel: "Due in 12 Days", source: "ESMA · Publications", url: "esma.europa.eu/press-news", interval: "Monthly scan · 2 alerts created · Last scan 18 days ago", btnClass: "sb-idle", btnLabel: "View Schedule" },
];

const VALIDATORS = [
  { id: "V1", name: "Validator Alpha", addr: "0x4a7f...9c21", stake: "5,000", score: 95, avatarClass: "va1" },
  { id: "V2", name: "Validator Beta", addr: "0x8c1b...3f77", stake: "8,200", score: 94, avatarClass: "va2" },
  { id: "V3", name: "Validator Gamma", addr: "0x2d9e...a841", stake: "6,750", score: 93, avatarClass: "va3" },
];

const DEMO_PROFILES = [
  { sector: "Financial Services", name: "FinServe Corp", desc: "US-regulated broker-dealer with UK branch. Consumer-facing financial products, algorithmic trading, crypto custody services.", sources: 6, alerts: 3 },
  { sector: "Healthcare", name: "MedTech Solutions", desc: "Medical device manufacturer with FDA-cleared AI diagnostic tools. EU MDR compliance required. Clinical data handling.", sources: 4, alerts: 1 },
  { sector: "Energy", name: "GridOps Energy", desc: "Renewable energy operator across 12 US states. FERC-regulated infrastructure, carbon credit obligations, grid interconnection.", sources: 3, alerts: 0 },
];

const WHY_TRAD = [
  "Sends a notification when a document is published - not whether it applies to you",
  "Keyword alerts have no understanding of context, sector, or operational scope",
  "Single AI model classification - no independent validation, no consensus",
  "No on-chain proof that the judgment was made - no source evidence, no audit trail",
  "Central server dependency - the vendor decides what you see",
];

const WHY_WT = [
  { text: "Validators fetch official source data and judge relevance against your company profile", tag: "Non-deterministic evaluation", color: "var(--pulse)", tagClass: "" },
  { text: "Three independent validators classify materiality, urgency, and action - consensus decides", tag: "GenLayer consensus", color: "var(--frost)", tagClass: "wtag-f" },
  { text: "Source URL, content digest, and verdict stored on-chain - immutable, auditable, provable", tag: "Source-attested alerts", color: "var(--pulse)", tagClass: "" },
  { text: "Keeper-triggered scan model - anyone can run due scans, no central scheduler needed", tag: "Decentralised operation", color: "var(--frost)", tagClass: "wtag-f" },
  { text: "Urgency and materiality are genuinely subjective - exactly the problem GenLayer was built for", tag: "GenLayer-native problem", color: "var(--aurora)", tagClass: "" },
];
