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
import hashlib
import json

from conftest import epoch_to_iso, warp_to


def _normalize_url(u: str) -> str:
    """Mirrors _normalize_url in contracts/watchtower.py -- kept in lockstep
    deliberately so fabricated-identity tests can compute the *correct*
    canonical_id/digest a genuine leader would produce, to use as a baseline
    that a tampered value is then diffed against."""
    v = u.strip().lower()
    v = v.split("?")[0].split("#")[0]
    if v.endswith("/"):
        v = v[:-1]
    return v


def _canonical_id(source_id: str, official_url: str) -> str:
    base = f"{source_id}|{_normalize_url(official_url)}"
    return hashlib.sha256(base.encode()).hexdigest()[:32]


def _profile_digest(profile_id: str, canonical_id: str) -> str:
    base = f"{profile_id}|{canonical_id}"
    return hashlib.sha256(base.encode()).hexdigest()[:32]


REAL_PAGE_TEXT = (
    "The CFPB issued a Final Rule on August 1, 2026 requiring enhanced "
    "disclosure for digital lending products. This rule takes effect "
    "immediately for covered entities."
)

TRUE_EVIDENCE_QUOTE = "requiring enhanced disclosure for digital lending products"
REAL_OFFICIAL_URL = "https://www.federalregister.gov/documents/2026/08/01/final-rule"
REAL_SOURCE_ID = "SRC-000001"  # matches the `registered_source` fixture's fixed id
REAL_PROFILE_ID = "PRF-000001"  # matches the `watch_profile` fixture's fixed id
REAL_CANONICAL_ID = _canonical_id(REAL_SOURCE_ID, REAL_OFFICIAL_URL)
REAL_DIGEST = _profile_digest(REAL_PROFILE_ID, REAL_CANONICAL_ID)


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
            "canonical_id": REAL_CANONICAL_ID, "digest": REAL_DIGEST,
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
            "canonical_id": REAL_CANONICAL_ID, "digest": REAL_DIGEST,
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
            "canonical_id": REAL_CANONICAL_ID, "digest": REAL_DIGEST,
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
            "canonical_id": REAL_CANONICAL_ID, "digest": REAL_DIGEST,
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
            "canonical_id": REAL_CANONICAL_ID, "digest": REAL_DIGEST,
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
            "canonical_id": REAL_CANONICAL_ID, "digest": REAL_DIGEST,
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
            "summary": "s", "evidence_quote": TRUE_EVIDENCE_QUOTE, "canonical_id": REAL_CANONICAL_ID, "digest": REAL_DIGEST,
            "verdict": {"document_type": "FINAL_RULE", "relevance": "HIGH", "materiality": "MATERIAL",
                        "urgency": "REVIEW_WITHIN_7_DAYS", "recommended_action": "COMPLIANCE_REVIEW"},
        }],
    })
    assert direct_vm.run_validator(leader_result=claim_with_own_fetch_failing) is False


def _valid_item(**overrides):
    item = {
        "title": "Digital Lending Disclosure Final Rule",
        "publication_date": "2026-08-01",
        "official_url": REAL_OFFICIAL_URL,
        "summary": "New disclosure requirements for digital lenders.",
        "evidence_quote": TRUE_EVIDENCE_QUOTE,
        "canonical_id": REAL_CANONICAL_ID,
        "digest": REAL_DIGEST,
        "verdict": {
            "document_type": "FINAL_RULE", "relevance": "HIGH", "materiality": "MATERIAL",
            "urgency": "REVIEW_WITHIN_7_DAYS", "recommended_action": "COMPLIANCE_REVIEW",
        },
    }
    item.update(overrides)
    return item


def test_validator_rejects_fabricated_canonical_id(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A leader cannot pick an arbitrary canonical_id disconnected from the
    real source_id + official_url -- it must exactly match what the validator
    itself recomputes. This is what stops a leader from either forcing a
    genuinely new document to collide with an existing identity, or dodging
    legitimate duplicate detection on a document already seen under its real
    identity."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [_valid_item(canonical_id="fabricated-canonical-id-0000000000")],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_fabricated_profile_digest(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """Same guarantee for the profile-scoped digest specifically: even with a
    correct canonical_id, an arbitrary digest that doesn't match
    _profile_item_id(profile_id, canonical_id) must be rejected -- the digest
    that actually gates duplicate detection can't be chosen freely either."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [_valid_item(digest="fabricated-digest-0000000000000000")],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_evidence_quote_longer_than_25_words(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """evidence_quote must be a short, pointed excerpt -- capping it at 25
    words (matching the extraction prompt's own instruction) keeps it a real
    pointer to a specific fact rather than a paraphrase-sized block that's
    trivially "found" as a substring of almost any related text."""
    _seed_scan_env(direct_vm, page_text=REAL_PAGE_TEXT + (
        " Additional context words padding this excerpt well past the twenty "
        "five word limit so it cannot possibly qualify as a short pointed quote "
        "under the rule the validator enforces here today."
    ))
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    long_quote = (
        "Additional context words padding this excerpt well past the twenty "
        "five word limit so it cannot possibly qualify as a short pointed quote "
        "under the rule the validator enforces here today"
    )
    assert len(long_quote.split()) > 25
    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [_valid_item(evidence_quote=long_quote)],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_valid_quote_with_mismatched_title(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A genuinely real, verbatim evidence_quote does not excuse an unrelated
    title that shares no real overlap with the independently-fetched source --
    each field is checked on its own, so a true quote can't be used to smuggle
    through a fabricated title for a different document entirely."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [_valid_item(title="Completely Unrelated Antitrust Merger Decree")],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_validator_rejects_valid_quote_with_mismatched_url(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """Same principle for official_url: a real evidence_quote and title don't
    excuse a URL on a different domain -- the URL is checked independently."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [_valid_item(official_url="https://example.com/not-the-real-source")],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False


def test_duplicate_attempt_using_a_changed_digest_is_rejected(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """A real scan already alerted on this exact document (real_official_url),
    recording it under the real, contract-computed digest. A second attempt
    on the SAME document -- with a leader claiming a different, freshly-made-up
    digest, presumably hoping to dodge the seen_profile_items dedup gate -- must
    still be rejected by the validator, because the digest is always
    recomputed from profile_id + canonical_id, never accepted as an arbitrary
    leader-chosen string. (The real write path goes further still: even
    without validator involvement, the post-consensus storage write in
    _run_scan_core recomputes canonical_id/digest itself from official_url and
    never persists whatever value the leader/consensus payload carried --
    see test_run_source_scan_duplicate_digest_not_double_counted in
    test_scans.py for that end-to-end proof via the real leader path.)"""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)  # real first scan, real alert

    disguised_duplicate = json.dumps({
        "fetch_ok": True,
        "items": [_valid_item(digest="a-fresh-digest-hoping-to-look-new")],
    })
    assert direct_vm.run_validator(leader_result=disguised_duplicate) is False


def test_validator_disagreement_commits_nothing(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    """Direct-mode's harness always takes the leader's own result for the
    actual contract call (it captures validator_fn for manual invocation
    rather than enforcing it on the write path itself -- see the module
    docstring), so this can't simulate real StudioNet consensus rejecting a
    transaction outright. What it CAN prove directly: invoking the captured
    validator_fn against a fabricated leader_result -- the disagreement case
    -- is a pure read of independently-fetched/re-derived data with no
    storage side effects of its own. State before and after a disagreeing
    run_validator() call is byte-for-byte identical: no new alert, no new
    scan, no new canonical/profile identity entry, no counter increment."""
    _seed_scan_env(direct_vm)
    _run_scan(watchtower, direct_vm, direct_bob, registered_source, watch_profile)  # one real alert exists
    before = watchtower.get_contract_summary()
    before_alert = watchtower.get_alert("ALT-000001")

    fabricated = json.dumps({
        "fetch_ok": True,
        "items": [_valid_item(canonical_id="totally-fabricated", digest="also-fabricated",
                               title="A Completely Different Fabricated Document")],
    })
    assert direct_vm.run_validator(leader_result=fabricated) is False

    after = watchtower.get_contract_summary()
    after_alert = watchtower.get_alert("ALT-000001")
    assert after == before
    assert after_alert == before_alert
