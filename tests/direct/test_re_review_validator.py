"""Direct proof that request_re_review's validator_fn independently re-fetches
and re-classifies, and that the contract -- not the model -- derives the
outcome label from the actual field-level changes agreed on. See
leader_fn/validator_fn and the outcome-derivation block inside
request_re_review in contracts/watchtower.py.
"""
import json

from conftest import epoch_to_iso, warp_to

SOURCE_TEXT = "CFPB final rule on digital lending disclosure, effective August 2026."
EVIDENCE_QUOTE = "CFPB final rule on digital lending disclosure"

ORIGINAL_JUDGMENT = """{"document_type":"FINAL_RULE","relevance":"MEDIUM",
"materiality":"POTENTIALLY_MATERIAL","urgency":"REVIEW_WITHIN_30_DAYS","impact_area":"disclosure",
"recommended_action":"MONITOR","responsible_team":"compliance","confidence":60,"reason":"initial read"}"""


def _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": SOURCE_TEXT, "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", json.dumps([{
        "title": "Rule", "publication_date": "2026-08-01", "document_type_hint": "FINAL_RULE",
        "official_url": "https://www.federalregister.gov/x", "summary": "s",
        "evidence_quote": EVIDENCE_QUOTE,
    }]))
    direct_vm.mock_llm(r".*Classify the impact.*", ORIGINAL_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob):
        watchtower.run_source_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01")
    return watchtower.get_profile_alert_ids(watch_profile, 0, 10)[0]


def _re_review_judgment(**overrides):
    base = {
        "document_type": "FINAL_RULE", "relevance": "MEDIUM", "materiality": "POTENTIALLY_MATERIAL",
        "urgency": "REVIEW_WITHIN_30_DAYS", "impact_area": "disclosure",
        "recommended_action": "MONITOR", "responsible_team": "compliance", "confidence": 60,
        "reason": "re-reviewed against the same source", "evidence_quote": EVIDENCE_QUOTE,
        "insufficient_context": False,
    }
    base.update(overrides)
    return base


def _do_re_review(watchtower, direct_vm, direct_bob, alert_id, reason_code="WRONG_RELEVANCE",
                   note="A substantive challenge with enough detail.", at=6000):
    warp_to(direct_vm, epoch_to_iso(at))
    with direct_vm.prank(direct_bob):
        watchtower.request_re_review(alert_id, reason_code, note)


# ── Validator independence ──────────────────────────────────────────────────

def test_validator_agrees_when_independent_reclassification_matches(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)
    assert direct_vm.run_validator() is True


def test_validator_rejects_fabricated_reclassification_not_grounded_in_evidence(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A leader claiming a drastic reclassification whose evidence_quote does
    not actually appear in the independently re-fetched source must be
    rejected -- vocabulary-valid fields alone are not enough."""
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    fabricated = json.dumps(_re_review_judgment(
        urgency="EMERGENCY_ACTION", materiality="HIGHLY_MATERIAL", relevance="CRITICAL",
        recommended_action="EXECUTIVE_ESCALATION",
        evidence_quote="a sentence that was never in the source text at all",
        fetch_ok=True,
    ))
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_claimed_severity_far_outside_own_independent_read(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    fabricated = json.dumps(_re_review_judgment(
        urgency="EMERGENCY_ACTION", materiality="HIGHLY_MATERIAL", relevance="CRITICAL",
        recommended_action="EXECUTIVE_ESCALATION", fetch_ok=True,
    ))
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_agrees_on_insufficient_context_only_if_classification_unchanged(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    honest_uncertainty = json.dumps(_re_review_judgment(insufficient_context=True, fetch_ok=True))
    assert direct_vm.run_validator(leader_result=honest_uncertainty) is True

    dishonest_uncertainty = json.dumps(_re_review_judgment(
        insufficient_context=True, urgency="IMMEDIATE_REVIEW", fetch_ok=True,
    ))
    assert direct_vm.run_validator(leader_result=dishonest_uncertainty) is False


# ── Deterministic outcome derivation (contract-computed, not model-reported) ─

def test_outcome_upheld_when_no_field_actually_changes(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "UPHELD"
    alert = watchtower.get_alert(alert_id)
    assert alert["last_reviewed_at"] == 0  # UPHELD must not mutate the alert


def test_outcome_urgency_raised_when_only_urgency_increases(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(urgency="IMMEDIATE_REVIEW")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "URGENCY_RAISED"
    alert = watchtower.get_alert(alert_id)
    assert alert["urgency"] == "IMMEDIATE_REVIEW"
    assert alert["last_reviewed_at"] == 6000


def test_outcome_urgency_reduced_when_only_urgency_decreases(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(urgency="WATCH_ONLY")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "URGENCY_REDUCED"
    assert watchtower.get_alert(alert_id)["urgency"] == "WATCH_ONLY"


def test_outcome_materiality_raised_when_only_materiality_increases(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(materiality="HIGHLY_MATERIAL")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "MATERIALITY_RAISED"
    assert watchtower.get_alert(alert_id)["materiality"] == "HIGHLY_MATERIAL"


def test_outcome_materiality_reduced_when_only_materiality_decreases(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(materiality="NON_MATERIAL")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "MATERIALITY_REDUCED"
    assert watchtower.get_alert(alert_id)["materiality"] == "NON_MATERIAL"


def test_outcome_reclassified_when_multiple_fields_change(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(urgency="IMMEDIATE_REVIEW", materiality="HIGHLY_MATERIAL",
                             relevance="CRITICAL", recommended_action="EXECUTIVE_ESCALATION")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "RECLASSIFIED"


def test_outcome_reclassified_updates_exactly_the_fields_that_changed(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A RECLASSIFIED outcome must change at least one substantive field, and
    must not silently alter fields the re-review didn't touch."""
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(document_type="GUIDANCE", recommended_action="LEGAL_REVIEW")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    alert = watchtower.get_alert(alert_id)
    assert alert["document_type"] == "GUIDANCE"
    assert alert["recommended_action"] == "LEGAL_REVIEW"
    # Untouched fields keep their original values.
    assert alert["urgency"] == "REVIEW_WITHIN_30_DAYS"
    assert alert["materiality"] == "POTENTIALLY_MATERIAL"


def test_outcome_source_unverifiable_when_refetch_fails(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.clear_mocks()  # re-fetch of official_url now fails for both leader and validator
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "SOURCE_UNVERIFIABLE"
    alert = watchtower.get_alert(alert_id)
    assert alert["last_reviewed_at"] == 0
    assert alert["urgency"] == "REVIEW_WITHIN_30_DAYS"


def test_outcome_more_context_required_leaves_alert_untouched(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(insufficient_context=True)
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "MORE_CONTEXT_REQUIRED"
    alert = watchtower.get_alert(alert_id)
    assert alert["last_reviewed_at"] == 0
    assert alert["urgency"] == "REVIEW_WITHIN_30_DAYS"


# ── Access control / input validation (existing behaviors, re-asserted here) ─

def test_unsupported_document_type_vocabulary_is_clamped_to_original(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A model returning a document_type outside the fixed enumeration must be
    clamped back to the original value, not accepted as a silent reclassification."""
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(document_type="NOT_A_REAL_TYPE")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    alert = watchtower.get_alert(alert_id)
    assert alert["document_type"] == "FINAL_RULE"  # clamped back to original, unchanged
    review = watchtower.get_review("REV-000001")
    assert review["outcome"] == "UPHELD"


def test_last_reviewed_at_only_changes_on_a_valid_completed_review(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    assert watchtower.get_alert(alert_id)["last_reviewed_at"] == 0

    # UPHELD -> still untouched.
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id, at=6000)
    assert watchtower.get_alert(alert_id)["last_reviewed_at"] == 0

    # A genuine reclassification -> now touched, timestamp from the real review call.
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": SOURCE_TEXT, "status": 200})
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(
        _re_review_judgment(urgency="IMMEDIATE_REVIEW")
    ))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id, reason_code="URGENCY_TOO_LOW", at=7000)
    assert watchtower.get_alert(alert_id)["last_reviewed_at"] == 7000


def test_validator_rejects_evidence_quote_longer_than_25_words(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)

    long_quote = " ".join(["word"] * 26)
    fabricated = json.dumps(_re_review_judgment(evidence_quote=long_quote, fetch_ok=True))
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_disagreement_commits_no_re_review_mutation(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """Same proof as test_scan_validator.py's version for request_re_review:
    running the captured validator_fn against a fabricated leader_result has
    no storage side effects of its own -- the alert and review record set are
    exactly as they were before the (disagreeing) validator call."""
    alert_id = _seed_alert(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.mock_llm(r".*re-reviewing a regulatory alert.*", json.dumps(_re_review_judgment()))
    _do_re_review(watchtower, direct_vm, direct_bob, alert_id)  # one real UPHELD review exists

    before_alert = watchtower.get_alert(alert_id)
    before_review = watchtower.get_review("REV-000001")
    before_summary = watchtower.get_contract_summary()

    fabricated = json.dumps(_re_review_judgment(
        urgency="EMERGENCY_ACTION", materiality="HIGHLY_MATERIAL",
        evidence_quote="a fabricated sentence never present in the real source", fetch_ok=True,
    ))
    assert direct_vm.run_validator(leader_result=fabricated) is False

    assert watchtower.get_alert(alert_id) == before_alert
    assert watchtower.get_review("REV-000001") == before_review
    assert watchtower.get_contract_summary() == before_summary
