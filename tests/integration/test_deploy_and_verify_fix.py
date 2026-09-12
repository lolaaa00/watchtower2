"""End-to-end verification: deploy the CURRENT contracts/watchtower.py (the
version reviewed in this remediation pass) fresh to StudioNet, then exercise
the full deterministic path (register_source_v2, create_watch_profile,
canonical reads) plus a real Signal Sweep (run_source_scan) that goes through
the actual leader_fn/validator_fn gl.vm.run_nondet consensus path live,
against real StudioNet LLM/web calls -- not mocks.

This exists because the previously-deployed contract address
(0x133E154c0A4E89B8de701938cffa2E3dff759fc4, referenced in .env.local before
this run) predates this remediation pass entirely -- exercising it would
prove nothing about the code actually being reviewed here. Every transaction
hash and the final deployed address are printed and also written to
docs/LAST_STUDIONET_DEPLOY.txt for the evidence record.

Run with: gltest tests/integration/test_deploy_and_verify_fix.py -v -s --network studionet
Consensus rounds are slow and variable (StudioNet, observed up to a few
minutes with leader rotation) -- this polls generously rather than using the
client's short default.
"""
from pathlib import Path

from gltest.contracts.contract_factory import get_contract_factory
from gltest.utils import extract_contract_address
from genlayer_py.types import TransactionStatus
from genlayer_py.types.transactions import TRANSACTION_STATUS_NUMBER_TO_NAME


def _status_name(receipt) -> str:
    raw = receipt.get("status") or receipt.get("status_name")
    return str(TRANSACTION_STATUS_NUMBER_TO_NAME.get(str(raw), raw))


def test_deploy_and_verify_current_contract_end_to_end(gl_client, accounts):
    assert len(accounts) >= 2, "studionet network needs at least 2 configured account keys"
    owner, bob = accounts[0], accounts[1]
    evidence_lines = []

    factory = get_contract_factory(contract_file_path="watchtower.py")
    deploy_receipt = factory.deploy_contract_tx(args=[], account=owner)
    contract_address = extract_contract_address(deploy_receipt)
    deploy_tx = deploy_receipt.get("hash") or deploy_receipt.get("tx_hash")
    print(f"\nDEPLOYED_CONTRACT_ADDRESS={contract_address}")
    print(f"DEPLOY_TX_HASH={deploy_tx}")
    evidence_lines += [f"contract_address={contract_address}", f"deploy_tx={deploy_tx}"]

    # -- register_source_v2 --
    source_url = "https://www.federalregister.gov/api/v1/documents.json?agencies=cfpb"
    register_tx = gl_client.write_contract(
        address=contract_address,
        function_name="register_source_v2",
        args=[
            "", "CFPB", "US", "financial_services", "rulemaking", "federal_register",
            source_url, "OFFICIAL", "86400", "0",
        ],
        account=owner,
    )
    register_receipt = gl_client.wait_for_transaction_receipt(
        transaction_hash=register_tx, status=TransactionStatus.FINALIZED, retries=40,
    )
    print(f"REGISTER_SOURCE_TX_HASH={register_tx} status={_status_name(register_receipt)}")
    evidence_lines += [f"register_source_tx={register_tx}", f"register_source_status={_status_name(register_receipt)}"]

    summary = gl_client.read_contract(address=contract_address, function_name="get_contract_summary", args=[])
    assert summary["total_sources"] == 1
    assert summary["total_profiles"] == 0

    source = gl_client.read_contract(address=contract_address, function_name="get_source", args=["SRC-000001"])
    assert source["authority"] == "CFPB"
    assert source["url"] == source_url

    # -- create_watch_profile --
    profile_tx = gl_client.write_contract(
        address=contract_address,
        function_name="create_watch_profile",
        args=[
            "Integration Verification Co", "financial_services", "US", "digital lending",
            "disclosure, consumer protection", "legal, compliance", "CFPB, lending", "",
        ],
        account=bob,
    )
    profile_receipt = gl_client.wait_for_transaction_receipt(
        transaction_hash=profile_tx, status=TransactionStatus.FINALIZED, retries=40,
    )
    print(f"CREATE_PROFILE_TX_HASH={profile_tx} status={_status_name(profile_receipt)}")
    evidence_lines += [f"create_profile_tx={profile_tx}", f"create_profile_status={_status_name(profile_receipt)}"]

    summary_after = gl_client.read_contract(address=contract_address, function_name="get_contract_summary", args=[])
    assert summary_after["total_profiles"] == 1

    profile = gl_client.read_contract(address=contract_address, function_name="get_profile", args=["PRF-000001"])
    assert profile["company_name"] == "Integration Verification Co"
    assert profile["owner"].lower() == str(bob.address).lower()

    # -- run_source_scan: the real leader_fn/validator_fn nondet consensus path --
    scan_tx = gl_client.write_contract(
        address=contract_address,
        function_name="run_source_scan",
        args=["PRF-000001", "SRC-000001", "2026-07-25", "2026-09-01", False, "DUE_SCAN"],
        account=bob,
    )
    scan_receipt = gl_client.wait_for_transaction_receipt(
        transaction_hash=scan_tx, status=TransactionStatus.ACCEPTED, retries=80, interval=3000,
    )
    scan_status_name = _status_name(scan_receipt)
    print(f"SCAN_TX_HASH={scan_tx} status={scan_status_name}")
    evidence_lines += [f"scan_tx={scan_tx}", f"scan_tx_status={scan_status_name}"]
    assert "ACCEPTED" in scan_status_name or "FINALIZED" in scan_status_name or "UNDETERMINED" in scan_status_name, (
        f"unexpected terminal status for run_source_scan: {scan_status_name}"
    )

    if "UNDETERMINED" in scan_status_name:
        # A real, documented, non-error StudioNet outcome (three leader
        # rotations without quorum agreement) -- nothing is written. See the
        # README's Honest Limits section. Nothing further to read back.
        evidence_lines.append("scan_record=NONE (UNDETERMINED, nothing written)")
    else:
        scan_ids = gl_client.read_contract(
            address=contract_address, function_name="get_profile_scan_ids", args=["PRF-000001", 0, 10],
        )
        assert scan_ids, "ACCEPTED/FINALIZED run_source_scan must have written a scan record"
        scan = gl_client.read_contract(address=contract_address, function_name="get_scan", args=[scan_ids[-1]])
        print(f"SCAN_ID={scan_ids[-1]} SCAN_STATUS={scan['status']} "
              f"candidates={scan['candidate_count']} alerts={scan['alert_count']} dupes={scan['duplicate_count']}")
        evidence_lines += [
            f"scan_id={scan_ids[-1]}", f"scan_record_status={scan['status']}",
            f"scan_candidate_count={scan['candidate_count']}", f"scan_alert_count={scan['alert_count']}",
            f"scan_duplicate_count={scan['duplicate_count']}",
        ]
        # The contract must never fabricate an alert with no candidates, and
        # never report a status inconsistent with its own alert_count -- both
        # are structural invariants of _run_scan_core, checkable from a live
        # canonical read regardless of what the source actually contained.
        assert scan["status"] in ("COMPLETED", "NO_UPDATES", "FAILED")
        if scan["status"] == "COMPLETED":
            assert int(scan["alert_count"]) > 0
        if scan["status"] in ("NO_UPDATES", "FAILED"):
            assert int(scan["alert_count"]) == 0

        if int(scan["alert_count"]) > 0:
            alert_ids = gl_client.read_contract(
                address=contract_address, function_name="get_profile_alert_ids", args=["PRF-000001", 0, 10],
            )
            alert = gl_client.read_contract(address=contract_address, function_name="get_alert", args=[alert_ids[-1]])
            print(f"ALERT_ID={alert_ids[-1]} title={alert['document_title']!r} url={alert['official_url']}")
            evidence_lines += [f"alert_id={alert_ids[-1]}", f"alert_official_url={alert['official_url']}"]

    out = Path(__file__).resolve().parents[2] / "docs" / "LAST_STUDIONET_DEPLOY.txt"
    out.write_text("\n".join(evidence_lines) + "\n")
