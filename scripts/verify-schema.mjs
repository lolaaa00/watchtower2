#!/usr/bin/env node
// Verifies every functionName the frontend calls actually exists on the deployed
// contract, with matching arity, per Phase 6 of the submission spec:
// "Fetch the deployed contract schema and check your call sites against it."
//
// Usage: node scripts/verify-schema.mjs
// Reads NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS from .env.local.

import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] ||= m[2].trim();
    }
  } catch {
    // .env.local is optional if the vars are already set in the environment
  }
}

// functionName -> expected positional arg count, sourced directly from
// lib/genlayer/reads.ts and lib/genlayer/writes.ts call sites.
const CALL_SITES = {
  // reads
  get_contract_summary: 0,
  get_profile: 1,
  get_alert: 1,
  get_scan: 1,
  get_source: 1,
  get_keeper_stats: 1,
  get_alerts_for_profile_v2: 3,
  get_profile_alert_ids_v2: 3,
  get_sources_page_v2: 2,
  get_profiles_by_owner_v2: 3,
  get_due_sources_v2: 3,
  is_scan_due_v2: 2,
  // writes
  register_source_v2: 10,
  create_watch_profile: 8,
  run_source_scan: 6,
  run_source_scan_bonded: 4,
  claim_bond: 1,
  challenge_scan: 2,
  recover_stray_balance: 1,
  run_manual_scan: 5,
  request_re_review: 3,
  dismiss_alert: 2,
  create_action_item: 4,
  resolve_action: 2,
};

async function main() {
  loadEnvLocal();
  const address = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS;
  if (!address) {
    console.error("NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS is not set (checked .env.local and env).");
    process.exit(1);
  }

  const client = createClient({ chain: studionet, account: createAccount() });
  const schema = await client.getContractSchema(address);
  const methods = schema?.methods ?? {};

  let failures = 0;
  for (const [name, expectedArity] of Object.entries(CALL_SITES)) {
    const method = methods[name];
    if (!method) {
      console.error(`✗ ${name}: not found on deployed contract at ${address}`);
      failures++;
      continue;
    }
    const actualArity = (method.params ?? method.inputs ?? []).length;
    if (actualArity !== expectedArity) {
      console.error(`✗ ${name}: frontend calls with ${expectedArity} args, deployed contract expects ${actualArity}`);
      failures++;
      continue;
    }
    console.log(`✓ ${name}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} mismatch(es) between frontend call sites and the deployed contract schema.`);
    process.exit(1);
  }
  console.log(`\nAll ${Object.keys(CALL_SITES).length} call sites verified against ${address}.`);
}

main().catch((e) => {
  console.error("Schema verification failed:", e?.message || e);
  process.exit(1);
});
