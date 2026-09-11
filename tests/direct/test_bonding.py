"""Direct-mode tests for the keeper bonding / challenge / slash flow.

A keeper posts KEEPER_BOND_WEI as native GEN to trigger a bonded scan. The
bond is refundable via claim_bond() once the challenge window closes, or
slashable via challenge_scan() if another keeper proves — deterministically,
by pointing at a later scan of the same source with an overlapping date
window that actually found alerts — that the bonded scan under-reported.
"""
import pytest

from conftest import epoch_to_iso, warp_to

KEEPER_BOND_WEI = 10_000_000_000_000_000

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

# A distinct item (different title/url -> different digest) so the evidence scan
# in the slashing test isn't silently deduped against the challenged scan's item.
DIFFERENT_EXTRACTION = """[
  {"title": "Digital Lending Disclosure Amendment", "publication_date": "2026-08-01",
   "document_type_hint": "FINAL_RULE",
   "official_url": "https://www.federalregister.gov/documents/2026/08/01/amendment",
   "summary": "A related amendment the first scan missed."}
]"""


def _seed(direct_vm, judgment=VALID_JUDGMENT):
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": "CFPB rule text.", "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", VALID_EXTRACTION)
    direct_vm.mock_llm(r".*Classify the impact.*", judgment)


def _run_bonded_scan_at(watchtower, direct_vm, sender, watch_profile, registered_source, epoch_seconds,
                         date_from="2026-07-25", date_to="2026-08-01"):
    warp_to(direct_vm, epoch_to_iso(epoch_seconds))
    with direct_vm.prank(sender):
        direct_vm.value = KEEPER_BOND_WEI
        try:
            return watchtower.run_source_scan_bonded(watch_profile, registered_source, date_from, date_to)
        finally:
            direct_vm.value = 0


def test_run_source_scan_bonded_requires_exact_bond(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    warp_to(direct_vm, epoch_to_iso(5000))
    with direct_vm.prank(direct_bob):
        direct_vm.value = KEEPER_BOND_WEI - 1
        try:
            with direct_vm.expect_revert("WRONG_BOND_AMOUNT"):
                watchtower.run_source_scan_bonded(watch_profile, registered_source, "2026-07-25", "2026-08-01")
        finally:
            direct_vm.value = 0


def test_run_source_scan_bonded_locks_bond(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    scan = watchtower.get_scan(scan_id)
    assert scan["bond_status"] == "LOCKED"
    assert scan["bond_amount"] == KEEPER_BOND_WEI
    assert scan["trigger_type"] == "DUE_SCAN_BONDED"
    # Note: get_contract_summary()["bonded_balance"] reads self.balance, which
    # direct-mode's simulated VM only updates via direct_vm.deal(), not from a
    # payable call's value= — a test-harness limitation, not a contract one.


def test_claim_bond_only_bonding_keeper(watchtower, direct_vm, direct_bob, direct_charlie, registered_source, watch_profile):
    _seed(direct_vm)
    _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]

    warp_to(direct_vm, epoch_to_iso(5000 + 3601))
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("ONLY_BONDING_KEEPER"):
        watchtower.claim_bond(scan_id)


def test_claim_bond_before_challenge_window_closes_reverts(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]

    warp_to(direct_vm, epoch_to_iso(5000 + 100))  # well inside the 1h window
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("CHALLENGE_WINDOW_OPEN"):
        watchtower.claim_bond(scan_id)


def test_claim_bond_after_window_succeeds(watchtower, direct_vm, direct_bob, registered_source, watch_profile):
    _seed(direct_vm)
    _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]

    warp_to(direct_vm, epoch_to_iso(5000 + 3601))
    with direct_vm.prank(direct_bob):
        watchtower.claim_bond(scan_id)

    scan = watchtower.get_scan(scan_id)
    assert scan["bond_status"] == "CLAIMED"

    with direct_vm.prank(direct_bob), direct_vm.expect_revert("BOND_NOT_CLAIMABLE"):
        watchtower.claim_bond(scan_id)


def test_challenge_scan_slashes_under_reported_scan(watchtower, direct_vm, direct_bob, direct_charlie, registered_source, watch_profile):
    # First bonded scan finds nothing relevant (NOT_RELEVANT judgment -> alert_count 0).
    _seed(direct_vm, judgment=NOT_RELEVANT_JUDGMENT)
    scan_id = _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    # A later manual scan of the overlapping window genuinely finds a relevant alert
    # (a distinct item, not the same digest the first scan already saw). mock_web/
    # mock_llm append rather than replace, and matching is first-registered-wins, so
    # the earlier NOT_RELEVANT-round mocks must be cleared first or they'd still win.
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*federalregister\.gov.*", {"body": "CFPB rule text.", "status": 200})
    direct_vm.mock_llm(r".*Extract up to 3.*", DIFFERENT_EXTRACTION)
    direct_vm.mock_llm(r".*Classify the impact.*", VALID_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5301))
    with direct_vm.prank(direct_bob):
        watchtower.run_manual_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01", "Re-checking after suspicious NO_UPDATES.")
    evidence_scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[1]

    with direct_vm.prank(direct_charlie):
        watchtower.challenge_scan(scan_id, evidence_scan_id)

    scan = watchtower.get_scan(scan_id)
    assert scan["bond_status"] == "SLASHED"

    # Slashed bonds can no longer be claimed by the original keeper.
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("BOND_NOT_CLAIMABLE"):
        watchtower.claim_bond(scan_id)


def test_challenge_scan_rejects_when_original_scan_found_alerts(watchtower, direct_vm, direct_bob, direct_charlie, registered_source, watch_profile):
    # The bonded scan actually found something -- it cannot be "under-reported".
    _seed(direct_vm, judgment=VALID_JUDGMENT)
    scan_id = _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    _seed(direct_vm, judgment=VALID_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5301))
    with direct_vm.prank(direct_bob):
        watchtower.run_manual_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01", "Second look at the same window.")
    evidence_scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[1]

    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("SCAN_NOT_UNDER_REPORTED"):
        watchtower.challenge_scan(scan_id, evidence_scan_id)


def test_challenge_scan_rejects_after_window_closes(watchtower, direct_vm, direct_bob, direct_charlie, registered_source, watch_profile):
    _seed(direct_vm, judgment=NOT_RELEVANT_JUDGMENT)
    scan_id = _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    _seed(direct_vm, judgment=VALID_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5000 + 3601))
    with direct_vm.prank(direct_bob):
        watchtower.run_manual_scan(watch_profile, registered_source, "2026-07-25", "2026-08-01", "Too late to matter for the challenge.")
    evidence_scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[1]

    warp_to(direct_vm, epoch_to_iso(5000 + 3700))  # past the challenge deadline
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("CHALLENGE_WINDOW_CLOSED"):
        watchtower.challenge_scan(scan_id, evidence_scan_id)


def test_challenge_scan_rejects_evidence_from_different_source(watchtower, direct_vm, direct_bob, direct_charlie, registered_source, future_due_source, watch_profile):
    _seed(direct_vm, judgment=NOT_RELEVANT_JUDGMENT)
    scan_id = _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)

    direct_vm.mock_web(r".*sec\.gov.*", {"body": "SEC notice text.", "status": 200})
    _seed(direct_vm, judgment=VALID_JUDGMENT)
    warp_to(direct_vm, epoch_to_iso(5301))
    with direct_vm.prank(direct_bob):
        watchtower.run_manual_scan(watch_profile, future_due_source, "2026-07-25", "2026-08-01", "Different source entirely.")
    evidence_scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[1]

    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("EVIDENCE_WRONG_SOURCE"):
        watchtower.challenge_scan(scan_id, evidence_scan_id)


def test_recover_stray_balance_only_owner(watchtower, direct_vm, direct_alice, direct_bob):
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("ONLY_OWNER"):
        watchtower.recover_stray_balance(direct_bob)


def test_recover_stray_balance_nothing_to_recover(watchtower, direct_vm, direct_alice):
    with direct_vm.prank(direct_alice), direct_vm.expect_revert("NOTHING_TO_RECOVER"):
        watchtower.recover_stray_balance(direct_alice)


def test_recover_stray_balance_recovers_untracked_surplus_only(watchtower, direct_vm, direct_alice, direct_bob, registered_source, watch_profile):
    # Simulate the confirmed StudioNet behavior: an UNDETERMINED bonded scan credits
    # the contract's balance without ever writing a ScanRecord. direct_vm.deal() sets
    # the contract's balance directly since direct-mode doesn't auto-credit from a
    # payable call's value= (a test-harness limitation documented earlier in this file).
    direct_vm.deal(direct_vm._contract_address, KEEPER_BOND_WEI)  # untracked stray GEN

    # A real locked bond must NOT be swept.
    _seed(direct_vm)
    _run_bonded_scan_at(watchtower, direct_vm, direct_bob, watch_profile, registered_source, 5000)
    direct_vm.deal(direct_vm._contract_address, KEEPER_BOND_WEI * 2)  # stray + one locked bond

    with direct_vm.prank(direct_alice):
        watchtower.recover_stray_balance(direct_alice)

    # The locked bond is still claimable after recovery -- only the stray surplus moved.
    scan_id = watchtower.get_profile_scan_ids(watch_profile, 0, 10)[0]
    assert watchtower.get_scan(scan_id)["bond_status"] == "LOCKED"
    # Note: a re-check that a second recovery call now reverts NOTHING_TO_RECOVER
    # isn't assertable here -- direct-mode's emit_transfer doesn't debit self.balance
    # (the same simulation gap as the earlier bonded_balance crediting limitation),
    # so the "surplus" would still appear present after this call in direct mode only.
