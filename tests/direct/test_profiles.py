"""Direct-mode tests for watch profile creation and ownership."""
import pytest

from conftest import epoch_to_iso, warp_to


def test_create_watch_profile_requires_company_name(direct_deploy, direct_vm, direct_bob):
    with direct_vm.prank(direct_bob):
        c = direct_deploy("contracts/watchtower.py")
        warp_to(direct_vm, epoch_to_iso(1000))
        with direct_vm.expect_revert("INVALID_PROFILE"):
            c.create_watch_profile(
                company_name="A", industry="", jurisdictions="", products="", risk_areas="",
                internal_teams="", keywords="", excluded_topics="",
            )


def test_update_watch_profile_only_owner(watchtower, direct_vm, direct_charlie, watch_profile):
    warp_to(direct_vm, epoch_to_iso(2000))
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("ONLY_PROFILE_OWNER"):
        watchtower.update_watch_profile(
            watch_profile, "Hostile Takeover Inc", "financial_services", "US", "", "", "", "", "",
        )


def test_update_watch_profile_owner_can_edit(watchtower, direct_vm, direct_bob, watch_profile):
    warp_to(direct_vm, epoch_to_iso(2000))
    with direct_vm.prank(direct_bob):
        watchtower.update_watch_profile(
            watch_profile, "Acme Lending Co (Renamed)", "financial_services", "US, CA",
            "digital lending", "disclosure", "legal", "CFPB, lending", "",
        )
    p = watchtower.get_profile(watch_profile)
    assert p["company_name"] == "Acme Lending Co (Renamed)"
    assert p["jurisdictions"] == "US, CA"
    assert p["updated_at"] == 2000


def test_get_profiles_by_owner_v2_filters_by_owner(watchtower, direct_vm, direct_bob, direct_charlie, watch_profile):
    warp_to(direct_vm, epoch_to_iso(1500))
    with direct_vm.prank(direct_charlie):
        watchtower.create_watch_profile(
            company_name="Charlie Co", industry="retail", jurisdictions="US", products="",
            risk_areas="", internal_teams="", keywords="", excluded_topics="",
        )
    bob_profiles = watchtower.get_profiles_by_owner_v2(str(direct_bob), "0", "20")
    assert [p["profile_id"] for p in bob_profiles] == [watch_profile]


def test_get_profile_not_found(watchtower):
    with pytest.raises(Exception, match="PROFILE_NOT_FOUND"):
        watchtower.get_profile("PRF-999999")
