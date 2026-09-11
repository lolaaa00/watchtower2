"""Direct-mode tests for run_source_scan: the core consensus workflow.

Covers the adversarial cases the submission spec calls out explicitly: fetch
failure never mutates state, malformed/non-JSON model output, out-of-range
clamping, duplicate-digest handling, the NOT_RELEVANT abstention path, and
cooldown/due-date boundaries on both sides using the warp_to helper.

now_ts is derived contract-side from gl.message_raw["datetime"] (see _now_ts()
in contracts/watchtower.py), not passed as a write argument, so every test that
needs a specific "current time" warps the VM clock first. Sender identity is
set via direct_vm.prank(address), never a sender= kwarg on the call itself.
"""
import pytest

from conftest import epoch_to_iso, warp_to

SOURCE_BODY = "CFPB issues final rule on digital lending disclosure requirements, effective 2026-09-01."

VALID_EXTRACTION = """[
  {"title": "Digital Lending Disclosure Final Rule", "publication_date": "2026-08-01",
   "document_type_hint": "FINAL_RULE",
   "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
   "summary": "New disclosure requirements for digital lenders."}
]"""

VALID_JUDGMENT = """{"document_type":"FINAL_RULE","relevance":"HIGH","materiality":"MATERIAL",
"urgency":"REVIEW_WITHIN_7_DAYS","impact_area":"disclosure","recommended_action":"COMPLIANCE_REVIEW",
"responsible_team":"compliance","confidence":85,"reason":"Directly affects disclosure workflow."}"""

NOT_RELEVANT_JUDGMENT = """{"document_type":"NOTICE","relevance":"NOT_RELEVANT","materiality":"NON_MATERIAL",
"urgency":"WATCH_ONLY","impact_area":"none","recommended_action":"NO_ACTION",
"responsible_team":"compliance","confidence":90,"reason":"Not applicable to this profile."}"""


def _seed(direct_vm, judgment=VALID_JUDGMENT):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": SOURCE_BODY, "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", VALID_EXTRACTION)
    direct_vm.mock_llm(r".*Classify the impact.*", judgment)


def _run_scan_at(watchtower, direct_vm, sender, watch_profile, registered_source, epoch_seconds,
                  date_from="2026-07-25", date_to="2026-08-01"):
    warp_to(direct_vm, epoch_to_iso(epoch_seconds))
    with direct_vm.prank(sender):
        watchtower.run_source_scan(watch_profile, registered_source, date_from, date_to)


def test_run_source_scan_creates_alert_for_relevant_item(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    scans = watchtower.get_profile_scan_ids(watch_profile, 0, 10)
    assert len(scans) == 1
    scan = watchtower.get_scan(scans[0])
    assert scan["status"] == "COMPLETED"
    assert scan["alert_count"] == 1

    alerts = watchtower.get_alerts_for_profile_v2(watch_profile, "0", "10")
    assert len(alerts) == 1
    assert alerts[0]["relevance"] == "HIGH"
    assert alerts[0]["materiality"] == "MATERIAL"


def test_run_source_scan_not_relevant_creates_no_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm, judgment=NOT_RELEVANT_JUDGMENT)
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "NO_UPDATES"
    assert scan["alert_count"] == 0


def test_run_source_scan_duplicate_digest_not_double_counted(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    # Advance past cooldown and re-run the identical scan window: same digest, must
    # dedupe. next_due_at (86400s out) hasn't arrived yet, so use run_manual_scan
    # (which bypasses the due-date check) to trigger the second scan.
    _seed(direct_vm)
    warp_to(direct_vm, epoch_to_iso(5301))
    with direct_vm.prank(direct_bob):
        watchtower.run_manual_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01", "Re-checking for duplicate handling.")

    second_scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[1]
    second_scan = watchtower.get_scan(second_scan_id)
    assert second_scan["duplicate_count"] == 1
    assert second_scan["alert_count"] == 0

    summary = watchtower.get_contract_summary()
    assert summary["total_alerts"] == 1


def test_run_source_scan_fetch_failure_never_creates_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"status": 500, "error": "upstream unavailable"})
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "FAILED"
    assert scan["alert_count"] == 0
    summary = watchtower.get_contract_summary()
    assert summary["total_alerts"] == 0


def test_run_source_scan_malformed_model_output_does_not_crash_or_mutate(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": SOURCE_BODY, "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", "not valid json at all")
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "FAILED"
    summary = watchtower.get_contract_summary()
    assert summary["total_alerts"] == 0


def test_run_source_scan_confidence_clamped_to_0_100(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    over_range_judgment = VALID_JUDGMENT.replace('"confidence":85', '"confidence":250')
    _seed(direct_vm, judgment=over_range_judgment)
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    # get_alerts_for_profile_v2 is a lightweight summary (no confidence field by
    # design) — full detail, including confidence, is only on get_alert.
    alert_id = watchtower.get_profile_alert_ids(watch_profile, 0, 10)[0]
    alert = watchtower.get_alert(alert_id)
    assert alert["confidence"] <= 100


def test_run_source_scan_not_due_reverts(watchtower, direct_vm, direct_bob, future_due_source, watch_profile):
    warp_to(direct_vm, epoch_to_iso(0))
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("SOURCE_NOT_DUE"):
        watchtower.run_source_scan(watch_profile, future_due_source, "2026-07-25", "2026-08-01")


def test_run_source_scan_cooldown_boundary(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)
    src = watchtower.get_source(registered_source)
    cooldown_until = src["cooldown_until"]

    # next_due_at (scan_interval_seconds later, 86400s) is always looser than
    # cooldown_until (300s later) in this fixture, so plain run_source_scan can
    # never reach the cooldown gate — it hits SOURCE_NOT_DUE first. Use
    # run_manual_scan (skip_due_check=True) to isolate the cooldown boundary.

    # One second before cooldown ends: must still revert.
    warp_to(direct_vm, epoch_to_iso(cooldown_until - 1))
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("SOURCE_COOLDOWN"):
        watchtower.run_manual_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01", "Boundary test just before cooldown ends.")

    # Exactly at the cooldown boundary: must succeed (>=, not >).
    _seed(direct_vm)
    warp_to(direct_vm, epoch_to_iso(cooldown_until))
    with direct_vm.prank(direct_bob):
        watchtower.run_manual_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01", "Boundary test exactly at cooldown end.")
    assert len(watchtower.get_profile_scan_ids(watch_profile, 0, 10)) == 2


def test_run_manual_scan_requires_reason(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("INVALID_MANUAL_SCAN_REASON"):
        watchtower.run_manual_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01", "hi")


def test_run_manual_scan_bypasses_due_date(watchtower, direct_vm, direct_bob, future_due_source, watch_profile):
    # future_due_source has next_due_at=999999999, far in the future. A manual
    # scan must still be able to run early (that's the entire point of "manual
    # override") while a plain run_source_scan on the same source would revert.
    _seed(direct_vm)
    warp_to(direct_vm, epoch_to_iso(0))
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("SOURCE_NOT_DUE"):
        watchtower.run_source_scan(watch_profile, future_due_source, "2026-07-25", "2026-08-01")

    with direct_vm.prank(direct_bob):
        watchtower.run_manual_scan(watch_profile, future_due_source, "2026-07-25", "2026-08-01", "Urgent leadership request ahead of schedule.")

    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    assert watchtower.get_scan(scan_id)["trigger_type"] == "MANUAL_SCAN"


def test_run_manual_scan_only_profile_owner(watchtower, direct_vm, direct_charlie, registered_source, watch_profile):
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("ONLY_PROFILE_OWNER"):
        watchtower.run_manual_scan(
            watch_profile, registered_source, "2026-07-25", "2026-08-01",
            "Urgent leadership request",
        )


def test_keeper_stats_track_scans_and_alerts(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    _run_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    stats = watchtower.get_keeper_stats_v2(str(direct_bob))
    assert stats["scans_triggered"] == 1
    assert stats["alerts_found"] == 1
    assert stats["reputation_band"] == "OBSERVER"  # 10 + 5 = 15 points, below the 30-point SCANNER threshold
