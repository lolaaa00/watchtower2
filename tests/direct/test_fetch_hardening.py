"""Direct-mode tests proving _fetch_page_text (scan) and _fetch_re_review_source
(re-review) treat anything short of a genuine 2xx-with-non-empty-body response
as a failed/unverifiable fetch -- never as evidence a document exists. Covers
HTTP 404, 500, a 3xx redirect, an empty body, and a malformed (non-dict) mock
response, for both the scan path and the re-review path.
"""
import json

import pytest

from conftest import epoch_to_iso, warp_to

REAL_SOURCE_BODY = "CFPB issues final rule on digital lending disclosure requirements, effective 2026-09-01."

VALID_EXTRACTION = """[
  {"title": "Digital Lending Disclosure Final Rule", "publication_date": "2026-08-01",
   "document_type_hint": "FINAL_RULE",
   "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
   "summary": "New disclosure requirements for digital lenders.",
   "evidence_quote": "CFPB issues final rule on digital lending disclosure requirements"}
]"""

VALID_JUDGMENT = """{"document_type":"FINAL_RULE","relevance":"HIGH","materiality":"MATERIAL",
"urgency":"REVIEW_WITHIN_7_DAYS","impact_area":"disclosure","recommended_action":"COMPLIANCE_REVIEW",
"responsible_team":"compliance","confidence":85,"reason":"Directly affects disclosure workflow."}"""


def _run_scan_with_web_response(watchtower, direct_vm, direct_bob, watch_profile, registered_source, web_response):
    direct_vm.mock_web(r".*federalregister\.gov.*", web_response)
    direct_vm.mock_llm(r".*Extract up to 3.*", VALID_EXTRACTION)
    direct_vm.mock_llm(r".*Classify the impact.*", VALID_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob):
        watchtower.run_source_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01")


@pytest.mark.parametrize("status", [301, 302, 404, 500, 503])
def test_scan_treats_non_2xx_status_as_failed(watchtower, direct_vm, direct_bob, registered_source, watch_profile, status):
    _run_scan_with_web_response(
        watchtower, direct_vm, direct_bob, watch_profile, registered_source,
        {"status": status, "body": REAL_SOURCE_BODY},
    )
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "FAILED"
    assert scan["alert_count"] == 0
    assert watchtower.get_contract_summary()["total_alerts"] == 0


def test_scan_treats_empty_body_as_failed_even_with_200(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _run_scan_with_web_response(
        watchtower, direct_vm, direct_bob, watch_profile, registered_source,
        {"status": 200, "body": ""},
    )
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "FAILED"
    assert scan["alert_count"] == 0
    assert watchtower.get_contract_summary()["total_alerts"] == 0


def test_scan_treats_whitespace_only_body_as_failed(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A body that is technically non-empty but contains nothing but
    whitespace is functionally an empty/malformed response and must not be
    treated as real page content."""
    _run_scan_with_web_response(
        watchtower, direct_vm, direct_bob, watch_profile, registered_source,
        {"status": 200, "body": "   \n\t  "},
    )
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "FAILED"
    assert scan["alert_count"] == 0


def test_scan_treats_missing_status_field_as_failed(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A malformed response missing a status entirely must not be treated as
    an implicit success -- there is no basis to assume 2xx."""
    direct_vm.mock_web(r".*federalregister\.gov.*", {"response": {"headers": {}, "body": REAL_SOURCE_BODY.encode()}})
    direct_vm.mock_llm(r".*Extract up to 3.*", VALID_EXTRACTION)
    direct_vm.mock_llm(r".*Classify the impact.*", VALID_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob):
        watchtower.run_source_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01")
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "FAILED"
    assert scan["alert_count"] == 0


def test_scan_succeeds_normally_on_genuine_200_with_body(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """Sanity check: the hardening above doesn't break the legitimate path."""
    _run_scan_with_web_response(
        watchtower, direct_vm, direct_bob, watch_profile, registered_source,
        {"status": 200, "body": REAL_SOURCE_BODY},
    )
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["status"] == "COMPLETED"
    assert scan["alert_count"] == 1


# ── Same hardening, for request_re_review's independent re-fetch ────────────

def _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": REAL_SOURCE_BODY, "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", VALID_EXTRACTION)
    direct_vm.mock_llm(r".*Classify the impact.*", VALID_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob):
        watchtower.run_source_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01")
    return watchtower.get_profile_alert_ids(watch_profile, 0, 10)[0]


@pytest.mark.parametrize("status", [301, 404, 500])
def test_re_review_treats_non_2xx_status_as_unverifiable(watchtower, direct_vm, direct_bob, registered_source, watch_profile, status):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    before = watchtower.get_alert(alert_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*federalregister\.gov.*", {"status": status, "body": REAL_SOURCE_BODY})
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_bob):
        watchtower.request_re_review(alert_id, "WRONG_RELEVANCE", "A substantive challenge with enough detail.")

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "SOURCE_UNVERIFIABLE"
    after = watchtower.get_alert(alert_id)
    assert after == before  # completely untouched


def test_re_review_treats_empty_body_as_unverifiable(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    before = watchtower.get_alert(alert_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*federalregister\.gov.*", {"status": 200, "body": ""})
    warp_to(direct_vm, epoch_to_iso(6000))
    with direct_vm.prank(direct_bob):
        watchtower.request_re_review(alert_id, "WRONG_RELEVANCE", "A substantive challenge with enough detail.")

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "SOURCE_UNVERIFIABLE"
    assert watchtower.get_alert(alert_id) == before
