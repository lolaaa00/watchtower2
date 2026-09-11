"""Direct-mode tests for source registration and access control."""
import pytest


def test_register_source_only_owner(direct_deploy, direct_vm, direct_alice, direct_bob):
    with direct_vm.prank(direct_alice):
        c = direct_deploy("contracts/watchtower.py")
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("ONLY_OWNER"):
        c.register_source_v2(
            source_id="", authority="CFPB", jurisdiction="US", sector="financial_services",
            source_type="rulemaking", adapter_type="federal_register",
            source_url="https://www.federalregister.gov/api/v1/documents.json",
            trust_level="OFFICIAL", scan_interval_seconds_str="86400", next_due_at_str="0",
        )


def test_register_source_rejects_short_url(direct_deploy, direct_vm, direct_alice):
    with direct_vm.prank(direct_alice):
        c = direct_deploy("contracts/watchtower.py")
        with direct_vm.expect_revert("INVALID_SOURCE_URL"):
            c.register_source_v2(
                source_id="", authority="CFPB", jurisdiction="US", sector="financial_services",
                source_type="rulemaking", adapter_type="federal_register",
                source_url="short", trust_level="OFFICIAL",
                scan_interval_seconds_str="86400", next_due_at_str="0",
            )


def test_register_source_v2_explicit_id_conflict(watchtower, direct_vm, direct_alice, registered_source):
    with direct_vm.prank(direct_alice), direct_vm.expect_revert("SOURCE_ALREADY_EXISTS"):
        watchtower.register_source_v2(
            source_id=registered_source, authority="CFPB", jurisdiction="US",
            sector="financial_services", source_type="rulemaking", adapter_type="federal_register",
            source_url="https://www.federalregister.gov/api/v1/documents.json",
            trust_level="OFFICIAL", scan_interval_seconds_str="86400", next_due_at_str="0",
        )


def test_get_source_not_found(watchtower):
    with pytest.raises(Exception, match="SOURCE_NOT_FOUND"):
        watchtower.get_source("SRC-999999")


def test_update_source_only_owner(watchtower, direct_vm, direct_bob, registered_source):
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("ONLY_OWNER"):
        watchtower.update_source(registered_source, "https://example.com/updated-source", "OFFICIAL", 3600)


def test_set_source_active_toggles_due_scans(watchtower, direct_vm, direct_alice, registered_source):
    with direct_vm.prank(direct_alice):
        watchtower.set_source_active(registered_source, False)
    assert watchtower.get_source(registered_source)["active"] is False
    assert watchtower.is_scan_due_v2(registered_source, "999999999") is False


def test_get_sources_page_v2_pagination(watchtower, direct_alice, registered_source):
    page = watchtower.get_sources_page_v2("0", "50")
    assert len(page) == 1
    assert page[0]["source_id"] == registered_source
    empty_page = watchtower.get_sources_page_v2("1", "50")
    assert empty_page == []
