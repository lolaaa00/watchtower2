import type { WatchtowerClient } from "./client";
import { getContractAddress } from "./client";
import type {
  SourceRecord,
  WatchProfile,
  ScanRecord,
  AlertRecord,
  KeeperStatsRecord,
  ContractSummary,
} from "../types";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function read(client: WatchtowerClient, functionName: string, args: any[] = [], retries = 3): Promise<any> {
  const contractAddr = getContractAddress();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await client.readContract({
        address: contractAddr,
        functionName,
        args,
      });
    } catch (e: any) {
      const msg = e?.message || "";
      const isRetryable = msg.includes("Server busy") || msg.includes("execution slots") || msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET");
      if (isRetryable && attempt < retries) {
        console.warn(`[read] ${functionName} busy, retry ${attempt}/${retries} in ${attempt * 3}s`);
        await sleep(attempt * 3000);
        continue;
      }
      console.error(`[read] ${functionName} failed | args=${JSON.stringify(args).slice(0, 100)} | error=${msg.slice(0, 120)}`);
      throw e;
    }
  }
}

// ── DIRECT METHODS ──

export async function getContractSummary(client: WatchtowerClient): Promise<ContractSummary> {
  try {
    return (await read(client, "get_contract_summary")) as ContractSummary;
  } catch {
    return { total_sources: 0, total_profiles: 0, total_scans: 0, total_alerts: 0, total_actions: 0, total_reviews: 0, owner: "" };
  }
}

export async function getProfile(client: WatchtowerClient, profileId: string): Promise<WatchProfile> {
  return (await read(client, "get_profile", [profileId])) as WatchProfile;
}

export async function getAlert(client: WatchtowerClient, alertId: string): Promise<AlertRecord> {
  return (await read(client, "get_alert", [alertId])) as AlertRecord;
}

export async function getScan(client: WatchtowerClient, scanId: string): Promise<ScanRecord> {
  return (await read(client, "get_scan", [scanId])) as ScanRecord;
}

export async function getSource(client: WatchtowerClient, sourceId: string): Promise<SourceRecord> {
  return (await read(client, "get_source", [sourceId])) as SourceRecord;
}

export async function getKeeperStats(client: WatchtowerClient, keeper: string): Promise<KeeperStatsRecord> {
  try {
    // Try checksummed first, then as-is
    const result = (await read(client, "get_keeper_stats", [keeper])) as KeeperStatsRecord;
    if (result.scans_triggered > 0) return result;
    // The contract may store with different casing — try fetching all known keepers
    const summary = await getContractSummary(client);
    for (let i = 1; i <= summary.total_scans; i++) {
      try {
        const scan = await getScan(client, `SCN-${String(i).padStart(6, "0")}`);
        if (scan.triggered_by && scan.triggered_by.toLowerCase() === keeper.toLowerCase()) {
          return (await read(client, "get_keeper_stats", [scan.triggered_by])) as KeeperStatsRecord;
        }
      } catch { /* skip */ }
    }
    return result;
  } catch {
    return { keeper, scans_triggered: 0, alerts_found: 0, duplicate_scans: 0, failed_scans: 0, last_active_at: 0, reputation_points: 0, reputation_band: "OBSERVER" };
  }
}

export async function getAlertsForProfile(client: WatchtowerClient, profileId: string, offset = 0, limit = 50): Promise<AlertRecord[]> {
  try {
    return (await read(client, "get_alerts_for_profile_v2", [profileId, String(offset), String(limit)])) as AlertRecord[];
  } catch {
    // Fallback: get alert IDs then fetch individually
    try {
      const summary = await getContractSummary(client);
      const results: AlertRecord[] = [];
      for (let i = 1; i <= summary.total_alerts; i++) {
        try {
          const a = await getAlert(client, `ALT-${String(i).padStart(6, "0")}`);
          if (a.profile_id === profileId) results.push(a);
        } catch { /* skip */ }
      }
      return results;
    } catch { return []; }
  }
}

export async function getProfileAlertIds(client: WatchtowerClient, profileId: string, offset = 0, limit = 50): Promise<string[]> {
  try {
    return (await read(client, "get_profile_alert_ids_v2", [profileId, String(offset), String(limit)])) as string[];
  } catch {
    return [];
  }
}

// ── WORKAROUND METHODS ──

export async function getSources(client: WatchtowerClient): Promise<SourceRecord[]> {
  try {
    return (await read(client, "get_sources_page_v2", ["0", "50"])) as SourceRecord[];
  } catch {
    // Fallback: fetch individually
    try {
      const summary = await getContractSummary(client);
      const results: SourceRecord[] = [];
      for (let i = 1; i <= summary.total_sources; i++) {
        try {
          const s = await getSource(client, `SRC-${String(i).padStart(6, "0")}`);
          if (s && s.source_id) results.push(s);
        } catch { /* skip */ }
      }
      return results;
    } catch { return []; }
  }
}

export async function getProfilesByOwner(client: WatchtowerClient, owner: string): Promise<WatchProfile[]> {
  if (!owner) return [];
  try {
    return (await read(client, "get_profiles_by_owner_v2", [owner, "0", "20"])) as WatchProfile[];
  } catch {
    // Fallback: fetch individually and filter
    try {
      const summary = await getContractSummary(client);
      const results: WatchProfile[] = [];
      for (let i = 1; i <= summary.total_profiles; i++) {
        try {
          const p = await getProfile(client, `PRF-${String(i).padStart(6, "0")}`);
          if (p && p.owner && p.owner.toLowerCase() === owner.toLowerCase()) results.push(p);
        } catch { /* skip */ }
      }
      return results;
    } catch { return []; }
  }
}

export async function getDueSources(client: WatchtowerClient, nowTs: number): Promise<string[]> {
  try {
    return (await read(client, "get_due_sources_v2", ["", String(nowTs), "50"])) as string[];
  } catch {
    // Fallback: fetch all sources and filter locally
    try {
      const sources = await getSources(client);
      return sources
        .filter((s) => s.active && nowTs >= s.next_due_at && nowTs >= s.cooldown_until)
        .map((s) => s.source_id);
    } catch { return []; }
  }
}

export async function isScanDue(client: WatchtowerClient, sourceId: string, nowTs: number): Promise<boolean> {
  try {
    return (await read(client, "is_scan_due_v2", [sourceId, String(nowTs)])) as boolean;
  } catch {
    try {
      const s = await getSource(client, sourceId);
      return s.active && nowTs >= s.next_due_at && nowTs >= s.cooldown_until;
    } catch { return false; }
  }
}
