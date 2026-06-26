import type { WatchtowerClient } from "./client";
import { getContractAddress } from "./client";

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
  const nowTs = Math.floor(Date.now() / 1000);
  return client.writeContract({
    address: getContractAddress(),
    functionName: "create_watch_profile",
    args: [
      params.company_name, params.industry, params.jurisdictions,
      params.products, params.risk_areas, params.internal_teams,
      params.keywords, params.excluded_topics, nowTs,
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
  const nowTs = Math.floor(Date.now() / 1000);
  return client.writeContract({
    address: getContractAddress(),
    functionName: "run_source_scan",
    args: [profileId, sourceId, nowTs, dateFrom, dateTo],
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
  const nowTs = Math.floor(Date.now() / 1000);
  return client.writeContract({
    address: getContractAddress(),
    functionName: "run_manual_scan",
    args: [profileId, sourceId, nowTs, dateFrom, dateTo, reason],
    value: BigInt(0),
  });
}

export async function requestReReview(
  client: WatchtowerClient,
  alertId: string,
  reasonCode: string,
  challengeNote: string
) {
  const nowTs = Math.floor(Date.now() / 1000);
  return client.writeContract({
    address: getContractAddress(),
    functionName: "request_re_review",
    args: [alertId, reasonCode, challengeNote, nowTs],
    value: BigInt(0),
  });
}

export async function dismissAlert(
  client: WatchtowerClient,
  alertId: string,
  note: string
) {
  const nowTs = Math.floor(Date.now() / 1000);
  return client.writeContract({
    address: getContractAddress(),
    functionName: "dismiss_alert",
    args: [alertId, note, nowTs],
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
  const nowTs = Math.floor(Date.now() / 1000);
  return client.writeContract({
    address: getContractAddress(),
    functionName: "create_action_item",
    args: [alertId, actionType, assignedTeam, dueLevel, nowTs],
    value: BigInt(0),
  });
}

export async function resolveAction(
  client: WatchtowerClient,
  actionId: string,
  note: string
) {
  const nowTs = Math.floor(Date.now() / 1000);
  return client.writeContract({
    address: getContractAddress(),
    functionName: "resolve_action",
    args: [actionId, note, nowTs],
    value: BigInt(0),
  });
}
