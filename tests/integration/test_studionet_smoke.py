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

Fixture names below (`accounts`, `gl_client`) are genlayer-test's real, installed
fixtures (confirmed against gltest/fixtures.py in this environment) -- an earlier
version of this file used `gl_alice`/`gl_bob`/`gl_contract_address`, which do not
exist in genlayer-test 0.29.2 and made this test fail at fixture resolution before
it ever touched the network. The contract address is read directly from
NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS in .env.local (the same address the frontend
targets), so this test always exercises whatever is actually deployed there.
"""
import os
import re
from pathlib import Path


def _load_deployed_contract_address() -> str:
    env_path = Path(__file__).resolve().parents[2] / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            m = re.match(r"^NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=(.+)$", line.strip())
            if m:
                return m.group(1).strip()
    return os.environ.get("NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS", "")


def test_register_source_and_create_profile_on_studionet(gl_client, accounts):
    contract_address = _load_deployed_contract_address()
    assert contract_address, "NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS not set in .env.local or environment"
    assert len(accounts) >= 2, "studionet network needs at least 2 configured account keys in gltest.config.yaml"
    alice, bob = accounts[0], accounts[1]

    source_url = "https://www.federalregister.gov/api/v1/documents.json?agencies=cfpb"

    tx_hash = gl_client.write_contract(
        address=contract_address,
        function_name="register_source_v2",
        args=[
            "", "CFPB", "US", "financial_services", "rulemaking", "federal_register",
            source_url, "OFFICIAL", "86400", "0",
        ],
        account=alice,
    )
    receipt = gl_client.wait_for_transaction_receipt(transaction_hash=tx_hash, status="FINALIZED")
    assert receipt["status"] == "FINALIZED" or receipt.get("status_name") == "FINALIZED"

    summary = gl_client.read_contract(address=contract_address, function_name="get_contract_summary", args=[])
    assert summary["total_sources"] >= 1

    profile_tx = gl_client.write_contract(
        address=contract_address,
        function_name="create_watch_profile",
        args=[
            "Integration Test Co", "financial_services", "US", "digital lending",
            "disclosure, consumer protection", "legal, compliance", "CFPB, lending",
            "",
        ],
        account=bob,
    )
    profile_receipt = gl_client.wait_for_transaction_receipt(transaction_hash=profile_tx, status="FINALIZED")
    assert profile_receipt["status"] == "FINALIZED" or profile_receipt.get("status_name") == "FINALIZED"
