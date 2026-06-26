export interface SourceRecord {
  source_id: string;
  authority: string;
  jurisdiction: string;
  sector: string;
  source_type: string;
  adapter: string;
  url: string;
  trust_level: string;
  active: boolean;
  scan_interval_seconds: number;
  last_scanned_at: number;
  next_due_at: number;
  cooldown_until: number;
  total_scans: number;
  total_alerts: number;
  last_error: string;
}

export interface WatchProfile {
  profile_id: string;
  owner: string;
  company_name: string;
  industry: string;
  jurisdictions: string;
  products: string;
  risk_areas: string;
  internal_teams: string;
  keywords: string;
  excluded_topics: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface ScanRecord {
  scan_id: string;
  profile_id: string;
  source_id: string;
  triggered_by: string;
  trigger_type: string;
  started_at: number;
  completed_at: number;
  status: string;
  source_url: string;
  date_from: string;
  date_to: string;
  candidate_count: number;
  alert_count: number;
  duplicate_count: number;
  skipped_count: number;
  error_code: string;
  result_summary: string;
}

export interface AlertRecord {
  alert_id: string;
  profile_id: string;
  source_id: string;
  scan_id: string;
  source_item_digest: string;
  authority: string;
  jurisdiction: string;
  sector: string;
  official_url: string;
  document_title: string;
  publication_date: string;
  document_type: string;
  short_extract: string;
  relevance: string;
  materiality: string;
  urgency: string;
  impact_area: string;
  recommended_action: string;
  responsible_team: string;
  confidence: number;
  reason: string;
  status: string;
  created_at: number;
  resolved_at: number;
  last_reviewed_at: number;
}

export interface KeeperStatsRecord {
  keeper: string;
  scans_triggered: number;
  alerts_found: number;
  duplicate_scans: number;
  failed_scans: number;
  last_active_at: number;
  reputation_points: number;
  reputation_band: string;
}

export interface ContractSummary {
  total_sources: number;
  total_profiles: number;
  total_scans: number;
  total_alerts: number;
  total_actions: number;
  total_reviews: number;
  owner: string;
}

export type TxStatus = "idle" | "prompting" | "submitted" | "confirming" | "confirmed" | "failed";

export interface TxState {
  status: TxStatus;
  hash?: string;
  error?: string;
}
