# v0.2.18
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json

address = Address


@allow_storage
@dataclass
class SourceRecord:
    source_id: str
    authority: str
    jurisdiction: str
    sector: str
    source_type: str
    adapter: str
    url: str
    trust_level: str
    active: bool
    scan_interval_seconds: u64
    last_scanned_at: u64
    next_due_at: u64
    cooldown_until: u64
    total_scans: u32
    total_alerts: u32
    last_error: str


@allow_storage
@dataclass
class WatchProfile:
    profile_id: str
    owner: address
    company_name: str
    industry: str
    jurisdictions: str
    products: str
    risk_areas: str
    internal_teams: str
    keywords: str
    excluded_topics: str
    active: bool
    created_at: u64
    updated_at: u64


@allow_storage
@dataclass
class ScanRecord:
    scan_id: str
    profile_id: str
    source_id: str
    triggered_by: address
    trigger_type: str
    started_at: u64
    completed_at: u64
    status: str
    source_url: str
    date_from: str
    date_to: str
    candidate_count: u32
    alert_count: u32
    duplicate_count: u32
    skipped_count: u32
    error_code: str
    result_summary: str


@allow_storage
@dataclass
class AlertRecord:
    alert_id: str
    profile_id: str
    source_id: str
    scan_id: str
    source_item_digest: str
    authority: str
    jurisdiction: str
    sector: str
    official_url: str
    document_title: str
    publication_date: str
    document_type: str
    short_extract: str
    relevance: str
    materiality: str
    urgency: str
    impact_area: str
    recommended_action: str
    responsible_team: str
    confidence: u32
    reason: str
    status: str
    created_at: u64
    resolved_at: u64
    last_reviewed_at: u64


@allow_storage
@dataclass
class ActionRecord:
    action_id: str
    alert_id: str
    profile_id: str
    action_type: str
    assigned_team: str
    status: str
    due_level: str
    created_at: u64
    completed_at: u64
    note: str


@allow_storage
@dataclass
class ReReviewRecord:
    review_id: str
    alert_id: str
    profile_id: str
    requester: address
    reason_code: str
    challenge_note: str
    original_verdict: str
    new_verdict: str
    outcome: str
    created_at: u64
    completed_at: u64


@allow_storage
@dataclass
class KeeperStats:
    keeper: address
    scans_triggered: u32
    alerts_found: u32
    duplicate_scans: u32
    failed_scans: u32
    last_active_at: u64
    reputation_points: u32
    reputation_band: str


class Contract(gl.Contract):
    owner: address
    source_counter: u32
    profile_counter: u32
    scan_counter: u32
    alert_counter: u32
    action_counter: u32
    review_counter: u32

    sources: TreeMap[str, SourceRecord]
    source_ids: str

    profiles: TreeMap[str, WatchProfile]
    profile_ids: str

    scans: TreeMap[str, ScanRecord]
    scan_ids: str

    alerts: TreeMap[str, AlertRecord]
    alert_ids: str

    actions: TreeMap[str, ActionRecord]
    action_ids: str

    reviews: TreeMap[str, ReReviewRecord]
    review_ids: str

    keeper_stats: TreeMap[str, KeeperStats]
    seen_item_digests: TreeMap[str, bool]
    profile_alert_index: TreeMap[str, str]
    source_scan_index: TreeMap[str, str]
    profile_scan_index: TreeMap[str, str]
    source_alert_index: TreeMap[str, str]
    keeper_scan_index: TreeMap[str, str]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.source_counter = u32(0)
        self.profile_counter = u32(0)
        self.scan_counter = u32(0)
        self.alert_counter = u32(0)
        self.action_counter = u32(0)
        self.review_counter = u32(0)
        self.source_ids = ""
        self.profile_ids = ""
        self.scan_ids = ""
        self.alert_ids = ""
        self.action_ids = ""
        self.review_ids = ""

    def _next_id(self, prefix: str, counter_name: str) -> str:
        val = getattr(self, counter_name)
        val = u32(val + u32(1))
        setattr(self, counter_name, val)
        return f"{prefix}-{str(int(val)).zfill(6)}"

    def _append_index(self, current: str, new_id: str) -> str:
        if current == "":
            return new_id
        return current + "|" + new_id

    def _index_page(self, stored: str, offset: int, limit: int) -> list:
        if stored == "":
            return []
        ids = stored.split("|")
        start = offset
        end = min(start + limit, len(ids))
        result = []
        for i in range(start, end):
            result.append(ids[i])
        return result

    def _index_all(self, stored: str) -> list:
        if stored == "":
            return []
        return stored.split("|")

    def _parse_int(self, value: str, field_name: str) -> int:
        try:
            parsed = int(value)
        except Exception:
            raise gl.UserError("INVALID_" + field_name)
        if parsed < 0:
            raise gl.UserError("INVALID_" + field_name)
        return parsed

    def _update_keeper(self, keeper: address, now_ts: u64, alerts: u32, dupes: u32, failed: bool):
        keeper_key = str(keeper)
        if keeper_key not in self.keeper_stats:
            self.keeper_stats[keeper_key] = KeeperStats(
                keeper=keeper,
                scans_triggered=u32(0),
                alerts_found=u32(0),
                duplicate_scans=u32(0),
                failed_scans=u32(0),
                last_active_at=u64(0),
                reputation_points=u32(0),
                reputation_band="OBSERVER",
            )
        stats = gl.storage.copy_to_memory(self.keeper_stats[keeper_key])
        stats.scans_triggered = u32(stats.scans_triggered + u32(1))
        stats.alerts_found = u32(stats.alerts_found + alerts)
        stats.duplicate_scans = u32(stats.duplicate_scans + dupes)
        if failed:
            stats.failed_scans = u32(stats.failed_scans + u32(1))
        stats.last_active_at = now_ts
        pts = int(stats.scans_triggered) * 10 + int(stats.alerts_found) * 5
        stats.reputation_points = u32(pts)
        if pts >= 500:
            stats.reputation_band = "WATCH CAPTAIN"
        elif pts >= 200:
            stats.reputation_band = "ARCHIVIST"
        elif pts >= 100:
            stats.reputation_band = "SENTINEL"
        elif pts >= 30:
            stats.reputation_band = "SCANNER"
        else:
            stats.reputation_band = "OBSERVER"
        self.keeper_stats[keeper_key] = stats

    # ── READ METHODS ──

    @gl.public.view
    def get_source(self, source_id: str) -> dict:
        if source_id not in self.sources:
            raise gl.UserError("SOURCE_NOT_FOUND")
        s = gl.storage.copy_to_memory(self.sources[source_id])
        return {
            "source_id": s.source_id, "authority": s.authority, "jurisdiction": s.jurisdiction,
            "sector": s.sector, "source_type": s.source_type, "adapter": s.adapter, "url": s.url,
            "trust_level": s.trust_level, "active": s.active,
            "scan_interval_seconds": int(s.scan_interval_seconds),
            "last_scanned_at": int(s.last_scanned_at), "next_due_at": int(s.next_due_at),
            "cooldown_until": int(s.cooldown_until), "total_scans": int(s.total_scans),
            "total_alerts": int(s.total_alerts), "last_error": s.last_error,
        }

    @gl.public.view
    def get_sources(self, offset: u32, limit: u32) -> list:
        if int(self.source_counter) == 0:
            return []
        result = []
        ids = self._index_all(self.source_ids)
        start = int(offset)
        end = min(start + int(limit), len(ids))
        for i in range(start, end):
            s = gl.storage.copy_to_memory(self.sources[ids[i]])
            result.append({
                "source_id": s.source_id, "authority": s.authority, "jurisdiction": s.jurisdiction,
                "sector": s.sector, "source_type": s.source_type, "adapter": s.adapter,
                "url": s.url, "trust_level": s.trust_level, "active": s.active,
                "scan_interval_seconds": int(s.scan_interval_seconds),
                "last_scanned_at": int(s.last_scanned_at), "next_due_at": int(s.next_due_at),
                "cooldown_until": int(s.cooldown_until), "total_scans": int(s.total_scans),
                "total_alerts": int(s.total_alerts), "last_error": s.last_error,
            })
        return result

    @gl.public.view
    def get_sources_page_v2(self, cursor_str: str, limit_str: str) -> list:
        if int(self.source_counter) == 0:
            return []
        result = []
        ids = self._index_all(self.source_ids)
        start = self._parse_int(cursor_str, "CURSOR")
        lim = self._parse_int(limit_str, "LIMIT")
        end = min(start + lim, len(ids))
        for i in range(start, end):
            s = gl.storage.copy_to_memory(self.sources[ids[i]])
            result.append({
                "source_id": s.source_id, "authority": s.authority, "jurisdiction": s.jurisdiction,
                "sector": s.sector, "source_type": s.source_type, "adapter": s.adapter,
                "url": s.url, "trust_level": s.trust_level, "active": s.active,
                "scan_interval_seconds": int(s.scan_interval_seconds),
                "last_scanned_at": int(s.last_scanned_at), "next_due_at": int(s.next_due_at),
                "cooldown_until": int(s.cooldown_until), "total_scans": int(s.total_scans),
                "total_alerts": int(s.total_alerts), "last_error": s.last_error,
            })
        return result

    @gl.public.view
    def get_profile(self, profile_id: str) -> dict:
        if profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        p = gl.storage.copy_to_memory(self.profiles[profile_id])
        return {
            "profile_id": p.profile_id, "owner": str(p.owner), "company_name": p.company_name,
            "industry": p.industry, "jurisdictions": p.jurisdictions, "products": p.products,
            "risk_areas": p.risk_areas, "internal_teams": p.internal_teams, "keywords": p.keywords,
            "excluded_topics": p.excluded_topics, "active": p.active,
            "created_at": int(p.created_at), "updated_at": int(p.updated_at),
        }

    @gl.public.view
    def get_profiles_by_owner(self, owner: address, offset: u32, limit: u32) -> list:
        if int(self.profile_counter) == 0:
            return []
        result = []
        ids = self._index_all(self.profile_ids)
        count = 0
        start = int(offset)
        lim = int(limit)
        for i in range(len(ids)):
            p = gl.storage.copy_to_memory(self.profiles[ids[i]])
            if p.owner == owner:
                if count >= start:
                    result.append({
                        "profile_id": p.profile_id, "owner": str(p.owner),
                        "company_name": p.company_name, "industry": p.industry,
                        "jurisdictions": p.jurisdictions, "products": p.products,
                        "risk_areas": p.risk_areas, "internal_teams": p.internal_teams,
                        "keywords": p.keywords, "excluded_topics": p.excluded_topics,
                        "active": p.active, "created_at": int(p.created_at),
                        "updated_at": int(p.updated_at),
                    })
                    if len(result) >= lim:
                        break
                count += 1
        return result

    @gl.public.view
    def get_profiles_by_owner_v2(self, owner_str: str, cursor_str: str, limit_str: str) -> list:
        if int(self.profile_counter) == 0:
            return []
        result = []
        ids = self._index_all(self.profile_ids)
        count = 0
        start = self._parse_int(cursor_str, "CURSOR")
        lim = self._parse_int(limit_str, "LIMIT")
        owner_norm = owner_str.lower()
        for i in range(len(ids)):
            p = gl.storage.copy_to_memory(self.profiles[ids[i]])
            if str(p.owner).lower() == owner_norm:
                if count >= start:
                    result.append({
                        "profile_id": p.profile_id, "owner": str(p.owner),
                        "company_name": p.company_name, "industry": p.industry,
                        "jurisdictions": p.jurisdictions, "products": p.products,
                        "risk_areas": p.risk_areas, "internal_teams": p.internal_teams,
                        "keywords": p.keywords, "excluded_topics": p.excluded_topics,
                        "active": p.active, "created_at": int(p.created_at),
                        "updated_at": int(p.updated_at),
                    })
                    if len(result) >= lim:
                        break
                count += 1
        return result

    @gl.public.view
    def is_scan_due(self, source_id: str, now_ts: u64) -> bool:
        if source_id not in self.sources:
            raise gl.UserError("SOURCE_NOT_FOUND")
        s = gl.storage.copy_to_memory(self.sources[source_id])
        return s.active and now_ts >= s.next_due_at and now_ts >= s.cooldown_until

    @gl.public.view
    def is_scan_due_v2(self, source_id: str, now_ts_str: str) -> bool:
        now_ts = u64(self._parse_int(now_ts_str, "NOW_TS"))
        if source_id not in self.sources:
            raise gl.UserError("SOURCE_NOT_FOUND")
        s = gl.storage.copy_to_memory(self.sources[source_id])
        return s.active and now_ts >= s.next_due_at and now_ts >= s.cooldown_until

    @gl.public.view
    def get_due_sources(self, now_ts: u64, offset: u32, limit: u32) -> list:
        if int(self.source_counter) == 0:
            return []
        result = []
        ids = self._index_all(self.source_ids)
        count = 0
        start = int(offset)
        lim = int(limit)
        for i in range(len(ids)):
            s = gl.storage.copy_to_memory(self.sources[ids[i]])
            if s.active and now_ts >= s.next_due_at and now_ts >= s.cooldown_until:
                if count >= start:
                    result.append(s.source_id)
                    if len(result) >= lim:
                        break
                count += 1
        return result

    @gl.public.view
    def get_due_sources_v2(self, profile_id: str, now_ts_str: str, limit_str: str) -> list:
        if profile_id != "" and profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        if int(self.source_counter) == 0:
            return []
        result = []
        ids = self._index_all(self.source_ids)
        now_ts = u64(self._parse_int(now_ts_str, "NOW_TS"))
        lim = self._parse_int(limit_str, "LIMIT")
        for i in range(len(ids)):
            s = gl.storage.copy_to_memory(self.sources[ids[i]])
            if s.active and now_ts >= s.next_due_at and now_ts >= s.cooldown_until:
                result.append(s.source_id)
                if len(result) >= lim:
                    break
        return result

    @gl.public.view
    def get_scan(self, scan_id: str) -> dict:
        if scan_id not in self.scans:
            raise gl.UserError("SCAN_NOT_FOUND")
        s = gl.storage.copy_to_memory(self.scans[scan_id])
        return {
            "scan_id": s.scan_id, "profile_id": s.profile_id, "source_id": s.source_id,
            "triggered_by": str(s.triggered_by), "trigger_type": s.trigger_type,
            "started_at": int(s.started_at), "completed_at": int(s.completed_at),
            "status": s.status, "source_url": s.source_url, "date_from": s.date_from,
            "date_to": s.date_to, "candidate_count": int(s.candidate_count),
            "alert_count": int(s.alert_count), "duplicate_count": int(s.duplicate_count),
            "skipped_count": int(s.skipped_count), "error_code": s.error_code,
            "result_summary": s.result_summary,
        }

    @gl.public.view
    def get_alert(self, alert_id: str) -> dict:
        if alert_id not in self.alerts:
            raise gl.UserError("ALERT_NOT_FOUND")
        a = gl.storage.copy_to_memory(self.alerts[alert_id])
        return {
            "alert_id": a.alert_id, "profile_id": a.profile_id, "source_id": a.source_id,
            "scan_id": a.scan_id, "source_item_digest": a.source_item_digest,
            "authority": a.authority, "jurisdiction": a.jurisdiction, "sector": a.sector,
            "official_url": a.official_url, "document_title": a.document_title,
            "publication_date": a.publication_date, "document_type": a.document_type,
            "short_extract": a.short_extract, "relevance": a.relevance,
            "materiality": a.materiality, "urgency": a.urgency, "impact_area": a.impact_area,
            "recommended_action": a.recommended_action, "responsible_team": a.responsible_team,
            "confidence": int(a.confidence), "reason": a.reason, "status": a.status,
            "created_at": int(a.created_at), "resolved_at": int(a.resolved_at),
            "last_reviewed_at": int(a.last_reviewed_at),
        }

    @gl.public.view
    def get_profile_alert_ids(self, profile_id: str, offset: u32, limit: u32) -> list:
        if profile_id not in self.profile_alert_index:
            return []
        stored = self.profile_alert_index[profile_id]
        return self._index_page(stored, int(offset), int(limit))

    @gl.public.view
    def get_profile_alert_ids_v2(self, profile_id: str, cursor_str: str, limit_str: str) -> list:
        if profile_id not in self.profile_alert_index:
            return []
        return self._index_page(
            self.profile_alert_index[profile_id],
            self._parse_int(cursor_str, "CURSOR"),
            self._parse_int(limit_str, "LIMIT"),
        )

    @gl.public.view
    def get_alerts_for_profile(self, profile_id: str, offset: u32, limit: u32) -> list:
        if profile_id not in self.profile_alert_index:
            return []
        ids = self._index_page(self.profile_alert_index[profile_id], int(offset), int(limit))
        result = []
        for i in range(len(ids)):
            a = gl.storage.copy_to_memory(self.alerts[ids[i]])
            result.append({
                "alert_id": a.alert_id, "profile_id": a.profile_id, "source_id": a.source_id,
                "scan_id": a.scan_id, "authority": a.authority, "document_title": a.document_title,
                "document_type": a.document_type, "relevance": a.relevance,
                "materiality": a.materiality, "urgency": a.urgency,
                "recommended_action": a.recommended_action, "status": a.status,
                "created_at": int(a.created_at),
            })
        return result

    @gl.public.view
    def get_alerts_for_profile_v2(self, profile_id: str, cursor_str: str, limit_str: str) -> list:
        if profile_id not in self.profile_alert_index:
            return []
        ids = self._index_page(
            self.profile_alert_index[profile_id],
            self._parse_int(cursor_str, "CURSOR"),
            self._parse_int(limit_str, "LIMIT"),
        )
        result = []
        for i in range(len(ids)):
            a = gl.storage.copy_to_memory(self.alerts[ids[i]])
            result.append({
                "alert_id": a.alert_id, "profile_id": a.profile_id, "source_id": a.source_id,
                "scan_id": a.scan_id, "authority": a.authority, "document_title": a.document_title,
                "document_type": a.document_type, "relevance": a.relevance,
                "materiality": a.materiality, "urgency": a.urgency,
                "recommended_action": a.recommended_action, "status": a.status,
                "created_at": int(a.created_at),
            })
        return result

    @gl.public.view
    def get_profile_scan_ids(self, profile_id: str, offset: u32, limit: u32) -> list:
        if profile_id not in self.profile_scan_index:
            return []
        return self._index_page(self.profile_scan_index[profile_id], int(offset), int(limit))

    @gl.public.view
    def get_source_scan_ids(self, source_id: str, offset: u32, limit: u32) -> list:
        if source_id not in self.source_scan_index:
            return []
        return self._index_page(self.source_scan_index[source_id], int(offset), int(limit))

    @gl.public.view
    def get_source_alert_ids(self, source_id: str, offset: u32, limit: u32) -> list:
        if source_id not in self.source_alert_index:
            return []
        return self._index_page(self.source_alert_index[source_id], int(offset), int(limit))

    @gl.public.view
    def get_keeper_scan_ids(self, keeper_str: str, offset: u32, limit: u32) -> list:
        if keeper_str not in self.keeper_scan_index:
            return []
        return self._index_page(self.keeper_scan_index[keeper_str], int(offset), int(limit))

    @gl.public.view
    def get_profile_scan_ids_v2(self, profile_id: str, cursor_str: str, limit_str: str) -> list:
        if profile_id not in self.profile_scan_index:
            return []
        return self._index_page(
            self.profile_scan_index[profile_id],
            self._parse_int(cursor_str, "CURSOR"),
            self._parse_int(limit_str, "LIMIT"),
        )

    @gl.public.view
    def get_source_scan_ids_v2(self, source_id: str, cursor_str: str, limit_str: str) -> list:
        if source_id not in self.source_scan_index:
            return []
        return self._index_page(
            self.source_scan_index[source_id],
            self._parse_int(cursor_str, "CURSOR"),
            self._parse_int(limit_str, "LIMIT"),
        )

    @gl.public.view
    def get_source_alert_ids_v2(self, source_id: str, cursor_str: str, limit_str: str) -> list:
        if source_id not in self.source_alert_index:
            return []
        return self._index_page(
            self.source_alert_index[source_id],
            self._parse_int(cursor_str, "CURSOR"),
            self._parse_int(limit_str, "LIMIT"),
        )

    @gl.public.view
    def get_keeper_scan_ids_v2(self, keeper_str: str, cursor_str: str, limit_str: str) -> list:
        if keeper_str not in self.keeper_scan_index:
            return []
        return self._index_page(
            self.keeper_scan_index[keeper_str],
            self._parse_int(cursor_str, "CURSOR"),
            self._parse_int(limit_str, "LIMIT"),
        )

    @gl.public.view
    def get_keeper_stats(self, keeper: address) -> dict:
        keeper_key = str(keeper)
        if keeper_key not in self.keeper_stats:
            return {
                "keeper": str(keeper), "scans_triggered": 0, "alerts_found": 0,
                "duplicate_scans": 0, "failed_scans": 0, "last_active_at": 0,
                "reputation_points": 0, "reputation_band": "OBSERVER",
            }
        k = gl.storage.copy_to_memory(self.keeper_stats[keeper_key])
        return {
            "keeper": str(k.keeper), "scans_triggered": int(k.scans_triggered),
            "alerts_found": int(k.alerts_found), "duplicate_scans": int(k.duplicate_scans),
            "failed_scans": int(k.failed_scans), "last_active_at": int(k.last_active_at),
            "reputation_points": int(k.reputation_points), "reputation_band": k.reputation_band,
        }

    @gl.public.view
    def get_keeper_stats_v2(self, keeper_str: str) -> dict:
        if keeper_str not in self.keeper_stats:
            return {
                "keeper": keeper_str, "scans_triggered": 0, "alerts_found": 0,
                "duplicate_scans": 0, "failed_scans": 0, "last_active_at": 0,
                "reputation_points": 0, "reputation_band": "OBSERVER",
            }
        k = gl.storage.copy_to_memory(self.keeper_stats[keeper_str])
        return {
            "keeper": str(k.keeper), "scans_triggered": int(k.scans_triggered),
            "alerts_found": int(k.alerts_found), "duplicate_scans": int(k.duplicate_scans),
            "failed_scans": int(k.failed_scans), "last_active_at": int(k.last_active_at),
            "reputation_points": int(k.reputation_points), "reputation_band": k.reputation_band,
        }

    @gl.public.view
    def get_contract_summary(self) -> dict:
        return {
            "total_sources": int(self.source_counter),
            "total_profiles": int(self.profile_counter),
            "total_scans": int(self.scan_counter),
            "total_alerts": int(self.alert_counter),
            "total_actions": int(self.action_counter),
            "total_reviews": int(self.review_counter),
            "owner": str(self.owner),
        }

    # ── WRITE METHODS ──

    @gl.public.write
    def register_source(
        self, authority: str, jurisdiction: str, sector: str, source_type: str,
        adapter: str, url: str, trust_level: str, scan_interval_seconds: u64,
        next_due_at: u64,
    ):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("ONLY_OWNER")
        if not url or len(url) < 10:
            raise gl.UserError("INVALID_SOURCE_URL")
        sid = self._next_id("SRC", "source_counter")
        rec = SourceRecord(
            source_id=sid, authority=authority, jurisdiction=jurisdiction, sector=sector,
            source_type=source_type, adapter=adapter, url=url, trust_level=trust_level,
            active=True, scan_interval_seconds=scan_interval_seconds,
            last_scanned_at=u64(0), next_due_at=next_due_at, cooldown_until=u64(0),
            total_scans=u32(0), total_alerts=u32(0), last_error="",
        )
        self.sources[sid] = rec
        self.source_ids = self._append_index(self.source_ids, sid)

    @gl.public.write
    def register_source_v2(
        self, source_id: str, authority: str, jurisdiction: str, sector: str,
        source_type: str, adapter_type: str, source_url: str, trust_level: str,
        scan_interval_seconds_str: str, next_due_at_str: str,
    ):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("ONLY_OWNER")
        if not source_url or len(source_url) < 10:
            raise gl.UserError("INVALID_SOURCE_URL")
        sid = source_id
        if sid == "":
            sid = self._next_id("SRC", "source_counter")
        else:
            if sid in self.sources:
                raise gl.UserError("SOURCE_ALREADY_EXISTS")
            self.source_counter = u32(int(self.source_counter) + 1)
        rec = SourceRecord(
            source_id=sid, authority=authority, jurisdiction=jurisdiction, sector=sector,
            source_type=source_type, adapter=adapter_type, url=source_url, trust_level=trust_level,
            active=True, scan_interval_seconds=u64(self._parse_int(scan_interval_seconds_str, "SCAN_INTERVAL_SECONDS")),
            last_scanned_at=u64(0),
            next_due_at=u64(self._parse_int(next_due_at_str, "NEXT_DUE_AT")),
            cooldown_until=u64(0),
            total_scans=u32(0), total_alerts=u32(0), last_error="",
        )
        self.sources[sid] = rec
        self.source_ids = self._append_index(self.source_ids, sid)

    @gl.public.write
    def update_source(self, source_id: str, url: str, trust_level: str, scan_interval_seconds: u64):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("ONLY_OWNER")
        if source_id not in self.sources:
            raise gl.UserError("SOURCE_NOT_FOUND")
        s = gl.storage.copy_to_memory(self.sources[source_id])
        s.url = url
        s.trust_level = trust_level
        s.scan_interval_seconds = scan_interval_seconds
        self.sources[source_id] = s

    @gl.public.write
    def set_source_active(self, source_id: str, active: bool):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("ONLY_OWNER")
        if source_id not in self.sources:
            raise gl.UserError("SOURCE_NOT_FOUND")
        s = gl.storage.copy_to_memory(self.sources[source_id])
        s.active = active
        self.sources[source_id] = s

    @gl.public.write
    def create_watch_profile(
        self, company_name: str, industry: str, jurisdictions: str, products: str,
        risk_areas: str, internal_teams: str, keywords: str, excluded_topics: str,
        now_ts: u64,
    ):
        if not company_name or len(company_name) < 2:
            raise gl.UserError("INVALID_PROFILE")
        pid = self._next_id("PRF", "profile_counter")
        rec = WatchProfile(
            profile_id=pid, owner=gl.message.sender_address, company_name=company_name,
            industry=industry, jurisdictions=jurisdictions, products=products,
            risk_areas=risk_areas, internal_teams=internal_teams, keywords=keywords,
            excluded_topics=excluded_topics, active=True, created_at=now_ts, updated_at=now_ts,
        )
        self.profiles[pid] = rec
        self.profile_ids = self._append_index(self.profile_ids, pid)

    @gl.public.write
    def update_watch_profile(
        self, profile_id: str, company_name: str, industry: str, jurisdictions: str,
        products: str, risk_areas: str, internal_teams: str, keywords: str,
        excluded_topics: str, now_ts: u64,
    ):
        if profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        p = gl.storage.copy_to_memory(self.profiles[profile_id])
        if p.owner != gl.message.sender_address:
            raise gl.UserError("ONLY_PROFILE_OWNER")
        p.company_name = company_name
        p.industry = industry
        p.jurisdictions = jurisdictions
        p.products = products
        p.risk_areas = risk_areas
        p.internal_teams = internal_teams
        p.keywords = keywords
        p.excluded_topics = excluded_topics
        p.updated_at = now_ts
        self.profiles[profile_id] = p

    @gl.public.write
    def run_source_scan(
        self, profile_id: str, source_id: str, now_ts: u64,
        date_from: str, date_to: str,
    ):
        if profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        if source_id not in self.sources:
            raise gl.UserError("SOURCE_NOT_FOUND")
        src = gl.storage.copy_to_memory(self.sources[source_id])
        if not src.active:
            raise gl.UserError("SOURCE_INACTIVE")
        if now_ts < src.next_due_at:
            raise gl.UserError("SOURCE_NOT_DUE")
        if now_ts < src.cooldown_until:
            raise gl.UserError("SOURCE_COOLDOWN")
        profile = gl.storage.copy_to_memory(self.profiles[profile_id])

        scan_id = self._next_id("SCN", "scan_counter")
        scan_rec = ScanRecord(
            scan_id=scan_id, profile_id=profile_id, source_id=source_id,
            triggered_by=gl.message.sender_address, trigger_type="DUE_SCAN",
            started_at=now_ts, completed_at=u64(0), status="FETCHING",
            source_url=src.url, date_from=date_from, date_to=date_to,
            candidate_count=u32(0), alert_count=u32(0), duplicate_count=u32(0),
            skipped_count=u32(0), error_code="", result_summary="",
        )

        profile_json = json.dumps({
            "company_name": profile.company_name, "industry": profile.industry,
            "jurisdictions": profile.jurisdictions, "products": profile.products,
            "risk_areas": profile.risk_areas, "internal_teams": profile.internal_teams,
            "keywords": profile.keywords, "excluded_topics": profile.excluded_topics,
        })

        def leader_fn():
            web_data = gl.nondet.web.request(
                src.url, method="GET"
            )
            page_text = web_data.body[:4000] if hasattr(web_data, 'body') else str(web_data)[:4000]

            extraction_prompt = f"""You are a regulatory source scanner for Watchtower.
Extract up to 3 recent regulatory items from this official source content.
Source: {src.authority} ({src.jurisdiction})
Date range: {date_from} to {date_to}

Source content:
{page_text}

Return JSON array of items. Each item must have:
- title: document title
- publication_date: YYYY-MM-DD or best estimate
- document_type_hint: one of FINAL_RULE, PROPOSED_RULE, GUIDANCE, ENFORCEMENT_ACTION, NOTICE, INFORMATIONAL, UNKNOWN
- official_url: the URL of the specific document if found, or the source URL
- summary: 1-2 sentence summary of the regulatory item

Return ONLY valid JSON array. If no items found, return empty array [].
"""
            items_raw = gl.nondet.exec_prompt(extraction_prompt, response_format='json')
            items = json.loads(items_raw) if isinstance(items_raw, str) else items_raw
            if not isinstance(items, list):
                items = []
            items = items[:3]

            verdicts = []
            for item in items:
                title = item.get("title", "Unknown")
                pub_date = item.get("publication_date", date_to)
                doc_type_hint = item.get("document_type_hint", "UNKNOWN")
                official_url = item.get("official_url", src.url)
                summary = item.get("summary", "")

                digest_base = f"{source_id}|{official_url}|{title}|{pub_date}"
                import hashlib
                digest = hashlib.sha256(digest_base.encode()).hexdigest()[:32]

                judgment_prompt = f"""You are evaluating a regulatory update for Watchtower.
Classify the impact of this official source item for the supplied company profile.
Do not provide legal advice. Do not invent facts. Use only the source item and company profile.
This is compliance intelligence, not legal advice.

Company profile:
{profile_json}

Official source item:
Title: {title}
Date: {pub_date}
Type hint: {doc_type_hint}
Authority: {src.authority}
Jurisdiction: {src.jurisdiction}
Sector: {src.sector}
URL: {official_url}
Summary: {summary}

Allowed document_type: FINAL_RULE, PROPOSED_RULE, GUIDANCE, ENFORCEMENT_ACTION, COURT_DECISION, CONSULTATION, NOTICE, RECALL, SAFETY_ALERT, STANDARD_UPDATE, INFORMATIONAL, UNKNOWN
Allowed relevance: NOT_RELEVANT, LOW, MEDIUM, HIGH, CRITICAL
Allowed materiality: NON_MATERIAL, POTENTIALLY_MATERIAL, MATERIAL, HIGHLY_MATERIAL
Allowed urgency: WATCH_ONLY, REVIEW_WITHIN_30_DAYS, REVIEW_WITHIN_7_DAYS, IMMEDIATE_REVIEW, EMERGENCY_ACTION
Allowed recommended_action: NO_ACTION, MONITOR, LEGAL_REVIEW, COMPLIANCE_REVIEW, POLICY_UPDATE, PRODUCT_REVIEW, REPORTING_REVIEW, CUSTOMER_NOTICE_REVIEW, SECURITY_CONTROL_REVIEW, EXECUTIVE_ESCALATION

Return ONLY this JSON:
{{"document_type":"...","relevance":"...","materiality":"...","urgency":"...","impact_area":"...","recommended_action":"...","responsible_team":"...","confidence":0-100,"reason":"..."}}
"""
                verdict_raw = gl.nondet.exec_prompt(judgment_prompt, response_format='json')
                verdict = json.loads(verdict_raw) if isinstance(verdict_raw, str) else verdict_raw

                verdicts.append({
                    "title": title,
                    "publication_date": pub_date,
                    "official_url": official_url,
                    "summary": summary[:200],
                    "digest": digest,
                    "verdict": verdict,
                })
            return json.dumps(verdicts)

        def validator_fn(leader_result):
            try:
                data = json.loads(leader_result.calldata) if hasattr(leader_result, 'calldata') else json.loads(str(leader_result))
                if not isinstance(data, list):
                    return False
                valid_doc_types = {"FINAL_RULE","PROPOSED_RULE","GUIDANCE","ENFORCEMENT_ACTION","COURT_DECISION","CONSULTATION","NOTICE","RECALL","SAFETY_ALERT","STANDARD_UPDATE","INFORMATIONAL","UNKNOWN"}
                valid_relevance = {"NOT_RELEVANT","LOW","MEDIUM","HIGH","CRITICAL"}
                valid_materiality = {"NON_MATERIAL","POTENTIALLY_MATERIAL","MATERIAL","HIGHLY_MATERIAL"}
                valid_urgency = {"WATCH_ONLY","REVIEW_WITHIN_30_DAYS","REVIEW_WITHIN_7_DAYS","IMMEDIATE_REVIEW","EMERGENCY_ACTION"}
                valid_actions = {"NO_ACTION","MONITOR","LEGAL_REVIEW","COMPLIANCE_REVIEW","POLICY_UPDATE","PRODUCT_REVIEW","REPORTING_REVIEW","CUSTOMER_NOTICE_REVIEW","SECURITY_CONTROL_REVIEW","EXECUTIVE_ESCALATION"}

                for item in data:
                    v = item.get("verdict", {})
                    if v.get("document_type") not in valid_doc_types:
                        return False
                    if v.get("relevance") not in valid_relevance:
                        return False
                    if v.get("materiality") not in valid_materiality:
                        return False
                    if v.get("urgency") not in valid_urgency:
                        return False
                    if v.get("recommended_action") not in valid_actions:
                        return False
                return True
            except Exception:
                return False

        try:
            consensus_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
            consensus_data = json.loads(consensus_raw)
        except Exception as e:
            scan_rec.status = "FAILED"
            scan_rec.error_code = str(e)[:100]
            scan_rec.completed_at = now_ts
            self.scans[scan_id] = scan_rec
            self.scan_ids = self._append_index(self.scan_ids, scan_id)
            existing_profile_scans = ""
            if profile_id in self.profile_scan_index:
                existing_profile_scans = self.profile_scan_index[profile_id]
            self.profile_scan_index[profile_id] = self._append_index(existing_profile_scans, scan_id)
            existing_source_scans = ""
            if source_id in self.source_scan_index:
                existing_source_scans = self.source_scan_index[source_id]
            self.source_scan_index[source_id] = self._append_index(existing_source_scans, scan_id)
            keeper_key = str(gl.message.sender_address)
            existing_keeper_scans = ""
            if keeper_key in self.keeper_scan_index:
                existing_keeper_scans = self.keeper_scan_index[keeper_key]
            self.keeper_scan_index[keeper_key] = self._append_index(existing_keeper_scans, scan_id)
            self._update_keeper(gl.message.sender_address, now_ts, u32(0), u32(0), True)
            src.last_scanned_at = now_ts
            src.next_due_at = u64(int(now_ts) + int(src.scan_interval_seconds))
            src.cooldown_until = u64(int(now_ts) + 300)
            src.total_scans = u32(int(src.total_scans) + 1)
            src.last_error = str(e)[:100]
            self.sources[source_id] = src
            return

        alert_count = u32(0)
        dupe_count = u32(0)
        candidate_count = u32(len(consensus_data))

        for item in consensus_data:
            digest = item.get("digest", "")
            if digest in self.seen_item_digests:
                dupe_count = u32(int(dupe_count) + 1)
                continue
            self.seen_item_digests[digest] = True

            v = item.get("verdict", {})
            if v.get("relevance") == "NOT_RELEVANT":
                continue

            aid = self._next_id("ALT", "alert_counter")
            alert = AlertRecord(
                alert_id=aid, profile_id=profile_id, source_id=source_id, scan_id=scan_id,
                source_item_digest=digest, authority=src.authority,
                jurisdiction=src.jurisdiction, sector=src.sector,
                official_url=item.get("official_url", src.url),
                document_title=item.get("title", "Unknown")[:200],
                publication_date=item.get("publication_date", ""),
                document_type=v.get("document_type", "UNKNOWN"),
                short_extract=item.get("summary", "")[:300],
                relevance=v.get("relevance", "LOW"),
                materiality=v.get("materiality", "NON_MATERIAL"),
                urgency=v.get("urgency", "WATCH_ONLY"),
                impact_area=v.get("impact_area", "general")[:100],
                recommended_action=v.get("recommended_action", "MONITOR"),
                responsible_team=v.get("responsible_team", "compliance")[:50],
                confidence=u32(min(max(int(v.get("confidence", 50)), 0), 100)),
                reason=v.get("reason", "")[:300],
                status="OPEN", created_at=now_ts, resolved_at=u64(0), last_reviewed_at=u64(0),
            )
            self.alerts[aid] = alert
            self.alert_ids = self._append_index(self.alert_ids, aid)
            existing_profile_alerts = ""
            if profile_id in self.profile_alert_index:
                existing_profile_alerts = self.profile_alert_index[profile_id]
            self.profile_alert_index[profile_id] = self._append_index(existing_profile_alerts, aid)
            existing_source_alerts = ""
            if source_id in self.source_alert_index:
                existing_source_alerts = self.source_alert_index[source_id]
            self.source_alert_index[source_id] = self._append_index(existing_source_alerts, aid)
            alert_count = u32(int(alert_count) + 1)

        scan_rec.status = "COMPLETED" if int(alert_count) > 0 else "NO_UPDATES"
        scan_rec.completed_at = now_ts
        scan_rec.candidate_count = candidate_count
        scan_rec.alert_count = alert_count
        scan_rec.duplicate_count = dupe_count
        scan_rec.result_summary = f"{int(candidate_count)} candidates, {int(alert_count)} alerts, {int(dupe_count)} dupes"
        self.scans[scan_id] = scan_rec
        self.scan_ids = self._append_index(self.scan_ids, scan_id)
        existing_profile_scans = ""
        if profile_id in self.profile_scan_index:
            existing_profile_scans = self.profile_scan_index[profile_id]
        self.profile_scan_index[profile_id] = self._append_index(existing_profile_scans, scan_id)
        existing_source_scans = ""
        if source_id in self.source_scan_index:
            existing_source_scans = self.source_scan_index[source_id]
        self.source_scan_index[source_id] = self._append_index(existing_source_scans, scan_id)
        keeper_key = str(gl.message.sender_address)
        existing_keeper_scans = ""
        if keeper_key in self.keeper_scan_index:
            existing_keeper_scans = self.keeper_scan_index[keeper_key]
        self.keeper_scan_index[keeper_key] = self._append_index(existing_keeper_scans, scan_id)

        src.last_scanned_at = now_ts
        src.next_due_at = u64(int(now_ts) + int(src.scan_interval_seconds))
        src.cooldown_until = u64(int(now_ts) + 300)
        src.total_scans = u32(int(src.total_scans) + 1)
        src.total_alerts = u32(int(src.total_alerts) + int(alert_count))
        src.last_error = ""
        self.sources[source_id] = src

        self._update_keeper(gl.message.sender_address, now_ts, alert_count, dupe_count, False)

    @gl.public.write
    def run_manual_scan(
        self, profile_id: str, source_id: str, now_ts: u64,
        date_from: str, date_to: str, reason: str,
    ):
        if not reason or len(reason) < 5:
            raise gl.UserError("INVALID_MANUAL_SCAN_REASON")
        if profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        if source_id not in self.sources:
            raise gl.UserError("SOURCE_NOT_FOUND")
        src = gl.storage.copy_to_memory(self.sources[source_id])
        if not src.active:
            raise gl.UserError("SOURCE_INACTIVE")
        if now_ts < src.cooldown_until:
            raise gl.UserError("SOURCE_COOLDOWN")
        p = gl.storage.copy_to_memory(self.profiles[profile_id])
        if p.owner != gl.message.sender_address:
            raise gl.UserError("ONLY_PROFILE_OWNER")
        self.run_source_scan(profile_id, source_id, now_ts, date_from, date_to)

    @gl.public.write
    def request_re_review(
        self, alert_id: str, reason_code: str, challenge_note: str, now_ts: u64,
    ):
        if alert_id not in self.alerts:
            raise gl.UserError("ALERT_NOT_FOUND")
        a = gl.storage.copy_to_memory(self.alerts[alert_id])
        if a.profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        p = gl.storage.copy_to_memory(self.profiles[a.profile_id])
        if p.owner != gl.message.sender_address:
            raise gl.UserError("ONLY_PROFILE_OWNER")
        valid_reasons = {
            "WRONG_RELEVANCE","URGENCY_TOO_HIGH","URGENCY_TOO_LOW",
            "MATERIALITY_TOO_HIGH","MATERIALITY_TOO_LOW","WRONG_DOCUMENT_TYPE",
            "WRONG_RESPONSIBLE_TEAM","INSUFFICIENT_CONTEXT","SOURCE_INTERPRETATION_ERROR",
        }
        if reason_code not in valid_reasons:
            raise gl.UserError("INVALID_REVIEW_BASIS")
        if not challenge_note or len(challenge_note) < 10:
            raise gl.UserError("INVALID_REVIEW_BASIS")

        original_verdict = json.dumps({
            "relevance": a.relevance, "materiality": a.materiality, "urgency": a.urgency,
            "document_type": a.document_type, "recommended_action": a.recommended_action,
            "responsible_team": a.responsible_team,
        })

        profile_json = json.dumps({
            "company_name": p.company_name, "industry": p.industry,
            "jurisdictions": p.jurisdictions, "products": p.products,
            "risk_areas": p.risk_areas,
        })

        def leader_fn():
            re_review_prompt = f"""You are re-reviewing a regulatory alert classification for Watchtower.
The profile owner has challenged the original classification.
This is compliance intelligence, not legal advice.

Original alert:
Title: {a.document_title}
Authority: {a.authority}
URL: {a.official_url}
Original verdict: {original_verdict}

Challenge reason: {reason_code}
Challenge note: {challenge_note}

Company profile: {profile_json}

Re-evaluate and return ONLY this JSON:
{{"document_type":"...","relevance":"...","materiality":"...","urgency":"...","impact_area":"...","recommended_action":"...","responsible_team":"...","confidence":0-100,"reason":"...","outcome":"..."}}

Allowed outcome: UPHELD, RECLASSIFIED, URGENCY_RAISED, URGENCY_REDUCED, MATERIALITY_RAISED, MATERIALITY_REDUCED, MORE_CONTEXT_REQUIRED, SOURCE_UNVERIFIABLE
"""
            raw = gl.nondet.exec_prompt(re_review_prompt, response_format='json')
            return raw

        def validator_fn(leader_result):
            try:
                data = json.loads(leader_result.calldata) if hasattr(leader_result, 'calldata') else json.loads(str(leader_result))
                valid_outcomes = {"UPHELD","RECLASSIFIED","URGENCY_RAISED","URGENCY_REDUCED","MATERIALITY_RAISED","MATERIALITY_REDUCED","MORE_CONTEXT_REQUIRED","SOURCE_UNVERIFIABLE"}
                return data.get("outcome") in valid_outcomes
            except Exception:
                return False

        try:
            raw_result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
            new_verdict_data = json.loads(raw_result)
        except Exception:
            rid = self._next_id("REV", "review_counter")
            rev = ReReviewRecord(
                review_id=rid, alert_id=alert_id, profile_id=a.profile_id,
                requester=gl.message.sender_address, reason_code=reason_code,
                challenge_note=challenge_note[:300], original_verdict=original_verdict,
                new_verdict="", outcome="UPHELD",
                created_at=now_ts, completed_at=now_ts,
            )
            self.reviews[rid] = rev
            self.review_ids = self._append_index(self.review_ids, rid)
            return

        new_verdict = json.dumps(new_verdict_data)
        outcome = new_verdict_data.get("outcome", "UPHELD")

        if outcome != "UPHELD":
            a.relevance = new_verdict_data.get("relevance", a.relevance)
            a.materiality = new_verdict_data.get("materiality", a.materiality)
            a.urgency = new_verdict_data.get("urgency", a.urgency)
            a.document_type = new_verdict_data.get("document_type", a.document_type)
            a.recommended_action = new_verdict_data.get("recommended_action", a.recommended_action)
            a.responsible_team = new_verdict_data.get("responsible_team", a.responsible_team)[:50]
            a.confidence = u32(min(max(int(new_verdict_data.get("confidence", 50)), 0), 100))
            a.reason = new_verdict_data.get("reason", a.reason)[:300]
            a.last_reviewed_at = now_ts
            self.alerts[alert_id] = a

        rid = self._next_id("REV", "review_counter")
        rev = ReReviewRecord(
            review_id=rid, alert_id=alert_id, profile_id=a.profile_id,
            requester=gl.message.sender_address, reason_code=reason_code,
            challenge_note=challenge_note[:300], original_verdict=original_verdict,
            new_verdict=new_verdict, outcome=outcome,
            created_at=now_ts, completed_at=now_ts,
        )
        self.reviews[rid] = rev
        self.review_ids = self._append_index(self.review_ids, rid)

    @gl.public.write
    def resolve_action(self, action_id: str, note: str, now_ts: u64):
        if action_id not in self.actions:
            raise gl.UserError("ACTION_NOT_FOUND")
        act = gl.storage.copy_to_memory(self.actions[action_id])
        if act.profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        p = gl.storage.copy_to_memory(self.profiles[act.profile_id])
        if p.owner != gl.message.sender_address:
            raise gl.UserError("ONLY_PROFILE_OWNER")
        act.status = "RESOLVED"
        act.completed_at = now_ts
        act.note = note[:300]
        self.actions[action_id] = act

    @gl.public.write
    def dismiss_alert(self, alert_id: str, note: str, now_ts: u64):
        if alert_id not in self.alerts:
            raise gl.UserError("ALERT_NOT_FOUND")
        a = gl.storage.copy_to_memory(self.alerts[alert_id])
        if a.profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        p = gl.storage.copy_to_memory(self.profiles[a.profile_id])
        if p.owner != gl.message.sender_address:
            raise gl.UserError("ONLY_PROFILE_OWNER")
        a.status = "DISMISSED"
        a.resolved_at = now_ts
        self.alerts[alert_id] = a

    @gl.public.write
    def create_action_item(
        self, alert_id: str, action_type: str, assigned_team: str,
        due_level: str, now_ts: u64,
    ):
        if alert_id not in self.alerts:
            raise gl.UserError("ALERT_NOT_FOUND")
        a = gl.storage.copy_to_memory(self.alerts[alert_id])
        if a.profile_id not in self.profiles:
            raise gl.UserError("PROFILE_NOT_FOUND")
        p = gl.storage.copy_to_memory(self.profiles[a.profile_id])
        if p.owner != gl.message.sender_address:
            raise gl.UserError("ONLY_PROFILE_OWNER")
        aid = self._next_id("ACT", "action_counter")
        act = ActionRecord(
            action_id=aid, alert_id=alert_id, profile_id=a.profile_id,
            action_type=action_type[:50], assigned_team=assigned_team[:50],
            status="OPEN", due_level=due_level[:30],
            created_at=now_ts, completed_at=u64(0), note="",
        )
        self.actions[aid] = act
        self.action_ids = self._append_index(self.action_ids, aid)
