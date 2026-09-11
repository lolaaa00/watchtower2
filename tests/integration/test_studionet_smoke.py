"""StudioNet integration smoke test.

Run with: gltest tests/integration/ -v -s --network studionet
(gltest defaults to localnet — the --network flag is required, see gltest.config.yaml
for the project default, which is already set to studionet.)

This exercises the full deterministic path (source registration, profile creation,
read-back) against real StudioNet consensus rather than mocked nondet calls. It does
not run a Signal Sweep, since that requires a live, fetchable source URL and consumes
real StudioNet LLM calls; the sweep path is covered by mocked adversarial cases in
tests/direct/test_scans.py and should additionally be exercised manually per Phase 7
of the submission checklist before every submission.
"""


def test_register_source_and_create_profile_on_studionet(gl_client, gl_alice, gl_bob, gl_contract_address):
    source_url = "https://www.federalregister.gov/api/v1/documents.json?agencies=cfpb"

    tx_hash = gl_client.write_contract(
        address=gl_contract_address,
        function_name="register_source_v2",
        args=[
            "", "CFPB", "US", "financial_services", "rulemaking", "federal_register",
            source_url, "OFFICIAL", "86400", "0",
        ],
        sender=gl_alice,
    )
    receipt = gl_client.wait_for_transaction_receipt(hash=tx_hash, status="FINALIZED")
    assert receipt.status_name == "FINALIZED"

    summary = gl_client.read_contract(address=gl_contract_address, function_name="get_contract_summary")
    assert summary["total_sources"] >= 1

    profile_tx = gl_client.write_contract(
        address=gl_contract_address,
        function_name="create_watch_profile",
        args=[
            "Integration Test Co", "financial_services", "US", "digital lending",
            "disclosure, consumer protection", "legal, compliance", "CFPB, lending",
            "",
        ],
        sender=gl_bob,
    )
    profile_receipt = gl_client.wait_for_transaction_receipt(hash=profile_tx, status="FINALIZED")
    assert profile_receipt.status_name == "FINALIZED"
