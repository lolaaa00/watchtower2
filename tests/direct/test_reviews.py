"""Direct-mode tests for request_re_review, dismiss_alert, and action items."""
import pytest

from conftest import epoch_to_iso, warp_to

RECLASSIFY_RESULT = """{"document_type":"FINAL_RULE","relevance":"CRITICAL","materiality":"HIGHLY_MATERIAL",
"urgency":"IMMEDIATE_REVIEW","impact_area":"disclosure","recommended_action":"EXECUTIVE_ESCALATION",
"responsible_team":"legal","confidence":90,"reason":"Escalated on review: broader scope than initially read.",
"outcome":"RECLASSIFIED"}"""


def _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": "CFPB final rule.", "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", """[{"title":"Rule","publication_date":"2026-08-01",
        "document_type_hint":"FINAL_RULE","official_url":"https://www.federalregister.gov/x","summary":"s"}]""")
    direct_vm.mock_llm(r".*Classify the impact.*", """{"document_type":"FINAL_RULE","relevance":"MEDIUM",
        "materiality":"POTENTIALLY_MATERIAL","urgency":"REVIEW_WITHIN_30_DAYS","impact_area":"disclosure",
        "recommended_action":"MONITOR","responsible_team":"compliance","confidence":60,"reason":"initial read"}""")
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob):
        watchtower.run_source_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01")
    return watchtower.get_profile_alert_ids(watch_profile, 0, 10)[0]


def test_request_re_review_only_profile_owner(watchtower, direct_vm, direct_bob, direct_charlie, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("ONLY_PROFILE_OWNER"):
        watchtower.request_re_review(alert_id, "URGENCY_TOO_LOW", "This needs immediate legal review, not monitoring.")


def test_request_re_review_rejects_invalid_reason_code(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("INVALID_REVIEW_BASIS"):
        watchtower.request_re_review(alert_id, "I_JUST_DISAGREE", "This needs immediate legal review.")


def test_request_re_review_rejects_short_note(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("INVALID_REVIEW_BASIS"):
        watchtower.request_re_review(alert_id, "URGENCY_TOO_LOW", "too short")


def test_request_re_review_reclassifies_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", RECLASSIFY_RESULT)
    warp_to(direct_vm, epoch_to_iso(6000))

    with direct_vm.prank(direct_bob):
        watchtower.request_re_review(alert_id, "URGENCY_TOO_LOW", "This needs immediate legal review, not monitoring.")

    alert = watchtower.get_alert(alert_id)
    assert alert["urgency"] == "IMMEDIATE_REVIEW"
    assert alert["responsible_team"] == "legal"
    assert alert["last_reviewed_at"] == 6000


def test_request_re_review_malformed_result_is_review_failed_not_upheld(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A technical/consensus failure (unparseable model output) must be recorded
    as its own distinct REVIEW_FAILED outcome, never mislabeled as UPHELD -- a
    real substantive decision was never reached, so it must not be recorded as
    though the original classification was actively re-affirmed."""
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", "completely broken, not json")
    warp_to(direct_vm, epoch_to_iso(6000))

    with direct_vm.prank(direct_bob):
        watchtower.request_re_review(alert_id, "URGENCY_TOO_LOW", "This needs immediate legal review, not monitoring.")

    alert = watchtower.get_alert(alert_id)
    assert alert["urgency"] == "REVIEW_WITHIN_30_DAYS"  # unchanged from initial read
    assert alert["last_reviewed_at"] == 0  # a failed review must not touch the alert at all

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "REVIEW_FAILED"
    assert review["new_verdict"] == ""


def test_dismiss_alert_only_profile_owner(watchtower, direct_vm, direct_bob, direct_charlie, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("ONLY_PROFILE_OWNER"):
        watchtower.dismiss_alert(alert_id, "not applicable")


def test_dismiss_alert_sets_status_and_resolved_at(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_bob):
        watchtower.dismiss_alert(alert_id, "already handled last quarter")
    alert = watchtower.get_alert(alert_id)
    assert alert["status"] == "DISMISSED"
    assert alert["resolved_at"] == 6000


def test_create_and_resolve_action_item(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_bob):
        watchtower.create_action_item(alert_id, "POLICY_UPDATE", "legal", "HIGH")
    action_ids = watchtower.get_contract_summary()["total_actions"]
    assert action_ids == 1

    warp_to(direct_vm, epoch_to_iso(7000))
    with direct_vm.prank(direct_bob):
        watchtower.resolve_action("ACT-000001", "Policy updated and published.")
