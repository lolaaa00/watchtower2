import type { WatchtowerClient } from "./client";
import { getContractAddress } from "./client";

// None of these pass a client-supplied timestamp anymore — the contract derives
// now_ts itself from gl.message.raw.datetime, so a caller can't skew cooldown/
// expiry gating by lying about the time. See contracts/watchtower.py: _now_ts().

export async function registerSource(
  client: WatchtowerClient,
  params: {
    source_id?: string;
    authority: string;
    jurisdiction: string;
    sector: string;
    source_type: string;
    adapter: string;
    url: string;
    trust_level: string;
    scan_interval_seconds: number;
    next_due_at: number;
  }
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "register_source_v2",
    args: [
      params.source_id || "",
      params.authority, params.jurisdiction, params.sector,
      params.source_type, params.adapter, params.url, params.trust_level,
      String(params.scan_interval_seconds), String(params.next_due_at),
    ],
    value: BigInt(0),
  });
}

export async function createWatchProfile(
  client: WatchtowerClient,
  params: {
    company_name: string;
    industry: string;
    jurisdictions: string;
    products: string;
    risk_areas: string;
    internal_teams: string;
    keywords: string;
    excluded_topics: string;
  }
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "create_watch_profile",
    args: [
      params.company_name, params.industry, params.jurisdictions,
      params.products, params.risk_areas, params.internal_teams,
      params.keywords, params.excluded_topics,
    ],
    value: BigInt(0),
  });
}

export async function runSourceScan(
  client: WatchtowerClient,
  profileId: string,
  sourceId: string,
  dateFrom: string,
  dateTo: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "run_source_scan",
    args: [profileId, sourceId, dateFrom, dateTo, false, "DUE_SCAN"],
    value: BigInt(0),
  });
}

// Must match KEEPER_BOND_WEI in contracts/watchtower.py exactly — the contract
// rejects any other amount with WRONG_BOND_AMOUNT.
export const KEEPER_BOND_WEI = BigInt("10000000000000000"); // 0.01 GEN

export async function runSourceScanBonded(
  client: WatchtowerClient,
  profileId: string,
  sourceId: string,
  dateFrom: string,
  dateTo: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "run_source_scan_bonded",
    args: [profileId, sourceId, dateFrom, dateTo],
    value: KEEPER_BOND_WEI,
  });
}

// Owner-only safety net: recovers GEN credited to the contract's balance with no
// bond ledger entry (e.g. an UNDETERMINED bonded scan — see docs/DECISION_RECORD.md).
// Never touches funds behind a currently-LOCKED bond.
export async function recoverStrayBalance(client: WatchtowerClient, to: string) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "recover_stray_balance",
    args: [to],
    value: BigInt(0),
  });
}

export async function claimBond(client: WatchtowerClient, scanId: string) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "claim_bond",
    args: [scanId],
    value: BigInt(0),
  });
}

export async function challengeScan(
  client: WatchtowerClient,
  scanId: string,
  evidenceScanId: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "challenge_scan",
    args: [scanId, evidenceScanId],
    value: BigInt(0),
  });
}

export async function runManualScan(
  client: WatchtowerClient,
  profileId: string,
  sourceId: string,
  dateFrom: string,
  dateTo: string,
  reason: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "run_manual_scan",
    args: [profileId, sourceId, dateFrom, dateTo, reason],
    value: BigInt(0),
  });
}

export async function requestReReview(
  client: WatchtowerClient,
  alertId: string,
  reasonCode: string,
  challengeNote: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "request_re_review",
    args: [alertId, reasonCode, challengeNote],
    value: BigInt(0),
  });
}

export async function dismissAlert(
  client: WatchtowerClient,
  alertId: string,
  note: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "dismiss_alert",
    args: [alertId, note],
    value: BigInt(0),
  });
}

export async function createActionItem(
  client: WatchtowerClient,
  alertId: string,
  actionType: string,
  assignedTeam: string,
  dueLevel: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "create_action_item",
    args: [alertId, actionType, assignedTeam, dueLevel],
    value: BigInt(0),
  });
}

export async function resolveAction(
  client: WatchtowerClient,
  actionId: string,
  note: string
) {
  return client.writeContract({
    address: getContractAddress(),
    functionName: "resolve_action",
    args: [actionId, note],
    value: BigInt(0),
  });
}
