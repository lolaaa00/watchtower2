"""Shared fixtures for direct-mode contract tests.

direct_vm / direct_deploy / direct_alice / direct_bob / direct_charlie come from
the genlayer-test pytest plugin (installed via `pip install genlayer-test`).

Sender identity for a call is set via `direct_vm.prank(address)` (a context
manager) or `direct_vm.sender = address`, never via a `sender=` kwarg on the
deploy/write call itself — kwargs on those calls are forwarded straight into
the contract's own method signature. `direct_alice`/`direct_bob`/`direct_charlie`
are plain `genlayer.py.types.Address` objects, not wrapper objects, so
`str(direct_bob)` is the address string and `direct_vm.expect_revert(...)` (not
`direct_bob.expect_revert(...)`) is the revert-assertion context manager.
"""
import sys
from datetime import datetime, timezone

import pytest


def epoch_to_iso(epoch_seconds: int) -> str:
    """Contract writes derive now_ts from gl.message_raw['datetime'] (see _now_ts()
    in contracts/watchtower.py), so tests warp to an ISO string instead of passing
    a raw epoch int as a write argument."""
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def warp_to(direct_vm, iso: str) -> None:
    """Advance the VM clock everywhere the contract can read it.

    direct_vm.warp() advances _datetime and refreshes sender/origin in
    gl.message_raw, but does NOT update gl.message_raw["datetime"] itself
    (confirmed by reading gltest's _refresh_gl_message implementation) — that
    key is injected once at contract load and frozen after that. Without this,
    every cooldown/expiry/freshness test passes vacuously with zero elapsed time.
    """
    direct_vm.warp(iso)
    gl = sys.modules.get("genlayer.gl")
    if gl is None:
        return
    raw = getattr(gl, "message_raw", None)
    if isinstance(raw, dict):
        raw["datetime"] = iso
    nested = getattr(getattr(gl, "message", None), "raw", None)
    if isinstance(nested, dict):
        nested["datetime"] = iso


@pytest.fixture
def watchtower(direct_deploy, direct_vm, direct_alice):
    """Deploys the contract with direct_alice as owner."""
    with direct_vm.prank(direct_alice):
        return direct_deploy("contracts/watchtower.py")


@pytest.fixture
def registered_source(watchtower, direct_vm, direct_alice):
    with direct_vm.prank(direct_alice):
        watchtower.register_source_v2(
            source_id="",
            authority="CFPB",
            jurisdiction="US",
            sector="financial_services",
            source_type="rulemaking",
            adapter_type="federal_register",
            source_url="https://www.federalregister.gov/api/v1/documents.json?agencies=cfpb",
            trust_level="OFFICIAL",
            scan_interval_seconds_str="86400",
            next_due_at_str="0",
        )
    return "SRC-000001"


@pytest.fixture
def future_due_source(watchtower, direct_vm, direct_alice):
    """A source not due until epoch 999999999 — for testing the SOURCE_NOT_DUE path,
    where registered_source (next_due_at=0, always due) can't exercise it."""
    with direct_vm.prank(direct_alice):
        watchtower.register_source_v2(
            source_id="SRC-FUTURE",
            authority="SEC",
            jurisdiction="US",
            sector="financial_services",
            source_type="rulemaking",
            adapter_type="federal_register",
            source_url="https://www.sec.gov/rules-regulations/rulemaking-activity.json",
            trust_level="OFFICIAL",
            scan_interval_seconds_str="86400",
            next_due_at_str="999999999",
        )
    return "SRC-FUTURE"


@pytest.fixture
def watch_profile(watchtower, direct_vm, direct_bob):
    warp_to(direct_vm, epoch_to_iso(1000))
    with direct_vm.prank(direct_bob):
        watchtower.create_watch_profile(
            company_name="Acme Lending Co",
            industry="financial_services",
            jurisdictions="US",
            products="digital lending, consumer credit",
            risk_areas="disclosure, consumer protection",
            internal_teams="legal, compliance",
            keywords="CFPB, lending, disclosure",
            excluded_topics="",
        )
    return "PRF-000001"
