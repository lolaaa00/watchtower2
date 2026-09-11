"""Direct proof that run_source_scan's validator_fn independently re-fetches
and re-classifies rather than trusting the leader's claimed output.

Direct-mode's `gl.vm.run_nondet` always takes the leader's result for the
contract call itself (there's no multi-node consensus to simulate locally) --
but it captures the real `validator_fn` closure so it can be invoked directly
via `direct_vm.run_validator()`. That's the only way to prove, in this test
harness, that the validator does real independent work instead of rubber
stamping vocabulary-valid output. See leader_fn/validator_fn in
_run_scan_core (contracts/watchtower.py).
"""
import json

from conftest import epoch_to_iso, warp_to

REAL_PAGE_TEXT = (
    "The CFPB issued a Final Rule on August 1, 2026 requiring enhanced "
    "disclosure for digital lending products. This rule takes effect "
    "immediately for covered entities."
)

TRUE_EVIDENCE_QUOTE = "requiring enhanced disclosure for digital lending products"


def _seed_scan_env(direct_vm, page_text=REAL_PAGE_TEXT):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": page_text, "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", json.dumps([{
        "title": "Digital Lending Disclosure Final Rule",
        "publication_date": "2026-08-01",
        "document_type_hint": "FINAL_RULE",
        "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
        "summary": "New disclosure requirements for digital lenders.",
        "evidence_quote": TRUE_EVIDENCE_QUOTE,
    }]))
    direct_vm.mock_llm(r".*Classify the impact.*", json.dumps({
        "document_type": "FINAL_RULE", "relevance": "HIGH", "materiality": "MATERIAL",
        "urgency": "REVIEW_WITHIN_7_DAYS", "impact_area": "disclosure",
        "recommended_action": "COMPLIANCE_REVIEW", "responsible_team": "compliance",
        "confidence": 85, "reason": "Directly affects disclosure workflow.",
    }))


def _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob):
        watchtower.run_source_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01")


def test_validator_agrees_when_independent_refetch_matches(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """Positive case: the validator's own independent fetch + classification
    matches the leader's claim closely enough (within rank tolerance) -> agree."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    assert direct_vm.run_validator() is True


def test_validator_rejects_fabricated_title_and_url_outside_source_domain(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A leader claiming an official_url on a domain the registered source
    doesn't belong to must be rejected -- this is the fabricated-URL scenario
    the reviewer's rejection called out explicitly."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [{
            "title": "Totally Fabricated Emergency Rule",
            "publication_date": "2026-08-01",
            "official_url": "https://not-the-real-domain.example.com/fake-rule",
            "summary": "Fabricated.",
            "evidence_quote": TRUE_EVIDENCE_QUOTE,
            "canonical_id": "x", "digest": "y",
            "verdict": {
                "document_type": "EMERGENCY_ACTION", "relevance": "CRITICAL",
                "materiality": "HIGHLY_MATERIAL", "urgency": "EMERGENCY_ACTION",
                "recommended_action": "EXECUTIVE_ESCALATION",
            },
        }],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_evidence_quote_not_present_in_source(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A leader whose evidence_quote isn't a verbatim substring of the
    independently re-fetched page text is fabricating support for its claim."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [{
            "title": "Digital Lending Disclosure Final Rule",
            "publication_date": "2026-08-01",
            "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
            "summary": "New disclosure requirements for digital lenders.",
            "evidence_quote": "this exact sentence never appears anywhere in the source",
            "canonical_id": "x", "digest": "y",
            "verdict": {
                "document_type": "FINAL_RULE", "relevance": "HIGH", "materiality": "MATERIAL",
                "urgency": "REVIEW_WITHIN_7_DAYS", "recommended_action": "COMPLIANCE_REVIEW",
            },
        }],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_wrong_publication_date(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A publication_date that doesn't appear anywhere in the independently
    re-fetched source (not even by year) is a fabricated/wrong date claim."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [{
            "title": "Digital Lending Disclosure Final Rule",
            "publication_date": "2019-01-15",
            "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
            "summary": "New disclosure requirements for digital lenders.",
            "evidence_quote": TRUE_EVIDENCE_QUOTE,
            "canonical_id": "x", "digest": "y",
            "verdict": {
                "document_type": "FINAL_RULE", "relevance": "HIGH", "materiality": "MATERIAL",
                "urgency": "REVIEW_WITHIN_7_DAYS", "recommended_action": "COMPLIANCE_REVIEW",
            },
        }],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_wrong_document_type(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """document_type must match the validator's own independent classification
    exactly -- no tolerance, since this is a categorical fact about the
    document, not a judgment call."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [{
            "title": "Digital Lending Disclosure Final Rule",
            "publication_date": "2026-08-01",
            "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
            "summary": "New disclosure requirements for digital lenders.",
            "evidence_quote": TRUE_EVIDENCE_QUOTE,
            "canonical_id": "x", "digest": "y",
            "verdict": {
                "document_type": "COURT_DECISION", "relevance": "HIGH", "materiality": "MATERIAL",
                "urgency": "REVIEW_WITHIN_7_DAYS", "recommended_action": "COMPLIANCE_REVIEW",
            },
        }],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_unrelated_critical_severity_escalation(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A leader marking a routine, moderate-impact item as CRITICAL/
    EMERGENCY_ACTION/EXECUTIVE_ESCALATION -- far outside what the validator's
    own independent re-classification of the real content supports -- must be
    rejected, not approved just because those are valid enum values."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [{
            "title": "Digital Lending Disclosure Final Rule",
            "publication_date": "2026-08-01",
            "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
            "summary": "New disclosure requirements for digital lenders.",
            "evidence_quote": TRUE_EVIDENCE_QUOTE,
            "canonical_id": "x", "digest": "y",
            "verdict": {
                "document_type": "FINAL_RULE", "relevance": "CRITICAL", "materiality": "HIGHLY_MATERIAL",
                "urgency": "EMERGENCY_ACTION", "recommended_action": "EXECUTIVE_ESCALATION",
            },
        }],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_tolerates_harmless_confidence_and_wording_differences(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """The validator must not force byte-exact agreement -- a claim one rank
    off from the validator's own independent read (e.g. MEDIUM vs HIGH
    relevance) is still accepted, since RANK_TOLERANCE allows harmless
    differences in a genuinely borderline judgment call."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    close_but_not_identical = json.dumps({
        "fetch_ok": True,
        "items": [{
            "title": "Digital Lending Disclosure Final Rule",
            "publication_date": "2026-08-01",
            "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
            "summary": "New disclosure requirements for digital lenders, worded a bit differently.",
            "evidence_quote": TRUE_EVIDENCE_QUOTE,
            "canonical_id": "x", "digest": "y",
            "verdict": {
                "document_type": "FINAL_RULE", "relevance": "MEDIUM", "materiality": "MATERIAL",
                "urgency": "REVIEW_WITHIN_30_DAYS", "recommended_action": "COMPLIANCE_REVIEW",
            },
        }],
    })
    assert direct_vm.run_validator(leader_result=close_but_not_identical) is True


def test_validator_agrees_fetch_failed_when_it_independently_also_fails(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """Conservative behavior: both sides independently failing to fetch is a
    valid agreement (fetch_ok=False, no items) -- neither side manufactures a
    conclusion from unreachable material."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.clear_mocks()  # own re-fetch inside the validator now fails too

    fetch_failed_claim = json.dumps({"fetch_ok": False, "items": []})
    assert direct_vm.run_validator(leader_result=fetch_failed_claim) is True


def test_validator_rejects_leader_claiming_success_when_own_fetch_fails(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """If the validator's own independent fetch fails but the leader claims
    fetch_ok=True with items, that's an unverifiable, one-sided claim and must
    be rejected rather than trusted."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)
    direct_vm.clear_mocks()

    claim_with_own_fetch_failing = json.dumps({
        "fetch_ok": True,
        "items": [{
            "title": "Digital Lending Disclosure Final Rule", "publication_date": "2026-08-01",
            "official_url": "https://www.federalregister.gov/documents/2026/08/01/final-rule",
            "summary": "s", "evidence_quote": TRUE_EVIDENCE_QUOTE, "canonical_id": "x", "digest": "y",
            "verdict": {"document_type": "FINAL_RULE", "relevance": "HIGH", "materiality": "MATERIAL",
                        "urgency": "REVIEW_WITHIN_7_DAYS", "recommended_action": "COMPLIANCE_REVIEW"},
        }],
    })
    assert direct_vm.run_validator(leader_result=claim_with_own_fetch_failing) is False
