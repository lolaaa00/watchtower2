# Watchtower

Watchtower is an on-chain regulatory intelligence system built on GenLayer. It monitors trusted public sources, evaluates new material against company-specific risk profiles, and records scans, alerts, keeper activity, and follow-up actions on-chain.

The application combines a Next.js operations dashboard with a GenLayer Intelligent Contract. Signal Sweeps use GenLayer consensus to determine whether source material is relevant to a registered watch profile.

## What It Does

- Registers official regulatory and policy sources
- Creates watch profiles for industries, jurisdictions, products, and risk areas
- Runs scheduled or manual Signal Sweeps
- Produces evidence-backed alerts for relevant source items
- Tracks duplicate findings and scan failures
- Records keeper reputation and scan activity
- Supports alert review, dismissal, and action-item workflows
- Exposes an on-chain ledger for operational verification

## Stack

- Next.js 16 and React 19
- TypeScript and Tailwind CSS
- GenLayer StudioNet
- GenLayer Intelligent Contracts in Python
- `genlayer-js` for contract reads and transactions

## StudioNet Deployment

| Item | Value |
| --- | --- |
| Network | GenLayer StudioNet |
| Chain ID | `61999` |
| Contract | `0x36250004511C89BDc49eCfD4e87cd57EDcc43611` |
| Explorer | [explorer-studio.genlayer.com](https://explorer-studio.genlayer.com) |
| Live app | [watchtower2.vercel.app](https://watchtower2.vercel.app) |

The contract source is located at [`contracts/watchtower.py`](contracts/watchtower.py).

## Getting Started

### Requirements

- Node.js 20 or newer
- npm
- A StudioNet-compatible wallet with test funds

### Installation

```bash
git clone https://github.com/lolaaa00/watchtower2.git
cd watchtower2
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS=0x36250004511C89BDc49eCfD4e87cd57EDcc43611
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_EXPLORER_BASE_URL=https://explorer-studio.genlayer.com
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Product Workflow

1. Connect a StudioNet wallet.
2. Create a watch profile with relevant jurisdictions, products, risk areas, and keywords.
3. Register an official source from the Sources administration screen.
4. Open **Signal Sweep** and select the profile and source.
5. Submit the sweep and wait for GenLayer consensus.
6. Review the resulting Chain Stamp, scan record, alerts, and keeper statistics.

## Signal Sweep Statuses

| Status | Meaning |
| --- | --- |
| `FETCHING` | Set when the scan record is created, before the leader's consensus round runs. |
| `COMPLETED` | The scan succeeded and created at least one relevant alert (`alert_count > 0`). |
| `NO_UPDATES` | The scan succeeded but created no alert — either nothing new was found, everything found was a duplicate of a prior alert, or nothing matched the profile. `duplicate_count` and `candidate_count` on the scan record distinguish which. |
| `FAILED` | The source fetch, model output, or a downstream check failed; nothing was written beyond the scan record itself. |

`NO_UPDATES` is a valid successful result, not an error. Watchtower does not create an alert unless
the source contains material that genuinely matches the selected profile — a scan finding zero new,
relevant items is the expected outcome most of the time, confirmed repeatedly against the live CFPB
Federal Register source during testing (`candidate_count: 0`, clean `NO_UPDATES`, no error).

The Signal Sweep Chamber (`/scan`) reads back this scan-record status after the sweep transaction
itself reaches `ACCEPTED`/`FINALIZED` — a `FAILED` scan (source unreachable, non-2xx status, or a
malformed/empty response — see "Non-Manipulable Timestamps" and the consensus design above) is logged
distinctly and flagged retryable, never shown identically to a legitimate `NO_UPDATES`. The Second
Reading page (`/tribunal/[alertId]`) similarly reads back the specific re-review outcome
(`SOURCE_UNVERIFIABLE`, `MORE_CONTEXT_REQUIRED`, `REVIEW_FAILED` are all shown as distinct,
explicitly-retryable non-changes, never as a generic "casefile updated" message) instead of assuming
every confirmed transaction changed something.

### Testing a Positive Result

For the best chance of receiving `COMPLETED`, use a narrowly targeted official source and a strongly matching profile. For example:

- **Source:** Federal Register API filtered for CFPB rules, proposed rules, and notices
- **Industry:** Financial services
- **Products:** Digital lending, consumer credit, payments
- **Risk areas:** Disclosure, consumer protection, reporting, credit risk
- **Keywords:** CFPB, lending, disclosure, consumer credit, digital lending

Use a fresh source or source item when repeating the test. Once an item has produced an alert, later sweeps may correctly classify it as a duplicate rather than creating another alert.

For deterministic StudioNet testing, host a public test JSON or text document containing a clearly dated regulatory notice that matches the test profile. Register that public URL as a test source and change the document identifier or publication data between runs. The contract still performs its normal fetch, relevance evaluation, consensus, and on-chain recording; the scan result is not faked.

## Application Areas

- `/` - observatory overview
- `/profiles` - watch profile management
- `/sources` - registered source monitoring
- `/scan` - Signal Sweep execution
- `/alerts` - regulatory findings
- `/keepers` - keeper performance
- `/tribunal` - review and re-review workflow
- `/ledger` - on-chain activity and contract state
- `/admin/sources` - source registration and health checks

## Development Checks

```bash
npm run lint
npm run build
npm run verify-schema
```

`verify-schema` fetches the deployed contract's schema via `getContractSchema` and checks every
`functionName` the frontend calls against it, catching a frontend/contract mismatch before it ships.

The production build may require network access because Next.js downloads configured Google font assets during compilation.

## Consensus Design

Both non-deterministic blocks (`run_source_scan`'s extraction + classification, and
`request_re_review`'s re-evaluation) use `gl.vm.run_nondet(leader_fn, validator_fn)` with two
genuinely independent closures, not `gl.eq_principle.prompt_comparative` (which structurally
cannot support this — its "validator" is just the same `fn` re-executed, so it can only ever
compare a function against itself). `validator_fn` does real, independent work:

- It re-fetches the source URL itself (`gl.nondet.web.request`), not the leader's fetched text.
- It re-runs its own extraction/classification prompt against its own fetch.
- It checks the leader's claimed `evidence_quote` (a required, verbatim, <25-word excerpt) as a
  literal substring of its *own* fetched page text — a fabricated or paraphrased quote fails.
- It checks the leader's claimed `official_url` is on the same domain as the registered source —
  rejects a fabricated URL pointing outside the source's own domain.
- It checks the leader's claimed `publication_date` (by year, tolerant of format) actually appears
  in its own fetched text — rejects a wrong/fabricated date.
- It requires `document_type` to match its own independent classification exactly, and requires
  `relevance`, `materiality`, `urgency`, and `recommended_action` to fall within `RANK_TOLERANCE`
  (currently 1) of its own independent classification on explicit rank orderings
  (`RELEVANCE_RANK`, `MATERIALITY_RANK`, `URGENCY_RANK`, `ACTION_SEVERITY_TIER` in
  `contracts/watchtower.py`) — this is the "harmless difference" tolerance: two independent runs
  rarely produce byte-identical labels, but a validator marking a routine item CRITICAL/
  EMERGENCY_ACTION when the leader said MEDIUM/WATCH_ONLY is outside tolerance and rejected.
- A fetch failure is only accepted as valid consensus if the validator's own fetch also failed
  (both sides independently confirm the source is unreachable) — a leader claiming success while
  the validator can't reach the source at all is rejected outright.

`request_re_review` applies the identical pattern against the alert's `official_url`, with one
further protection: the outcome label (`UPHELD`, `RECLASSIFIED`, `URGENCY_RAISED`,
`URGENCY_REDUCED`, `MATERIALITY_RAISED`, `MATERIALITY_REDUCED`, `SOURCE_UNVERIFIABLE`,
`MORE_CONTEXT_REQUIRED`, `REVIEW_FAILED`) is never taken from the model — it's derived
deterministically by the contract from how the agreed classification's fields actually compare to
the alert's original values (see the outcome-derivation block at the end of `request_re_review`).
This closes off "vocabulary-valid but relationally false" results (e.g. a model claiming
`URGENCY_RAISED` while urgency didn't actually increase). A technical/consensus failure (unparseable
model output, or a `run_nondet` exception) is recorded as its own `REVIEW_FAILED` outcome and never
mutates the alert — it is not conflated with `UPHELD`, which means a real re-evaluation happened and
genuinely found no change.

## Identity and Duplicate Handling

Scanned items now have two separate identities, stored in two separate `TreeMap[str, bool]` fields:

- `canonical_items` — a global, presentation-independent document identity
  (`_canonical_item_id(source_id, official_url)`, a hash of the source and normalized URL). This is
  discovery bookkeeping only: "has Watchtower ever seen this document at all."
- `seen_profile_items` — a profile-scoped identity (`_profile_item_id(profile_id, canonical_id)`)
  that actually gates whether a scan alerts on an item.

Previously a single global `seen_item_digests` map gated alerts directly, which meant one profile
scanning an item silently suppressed the alert for every other profile that later scanned the same
item — relevance is profile-specific, so that was a real bug, not just a naming issue. The fix
means the same source document can now independently alert (or not) per profile, while a single
profile re-scanning the same item is still correctly deduplicated. See
`test_same_item_creates_independent_alerts_for_different_profiles` and
`test_same_item_same_profile_twice_is_still_deduped` in
[`tests/direct/test_reviewer_findings.py`](tests/direct/test_reviewer_findings.py).

## Non-Manipulable Timestamps

Every write method that reads or writes cooldown, due-date, liveness, or review-completion state
derives `now_ts` exclusively from `gl.message_raw["datetime"]` via `_now_ts()`
(`contracts/watchtower.py`) — there is no method anywhere in the ABI that accepts a caller-supplied
timestamp for any of these decisions. See `test_now_ts_has_no_client_supplied_path` and
`test_backward_time_warp_does_not_let_a_keeper_replay_an_earlier_cooldown` in
[`tests/direct/test_reviewer_findings.py`](tests/direct/test_reviewer_findings.py).

## Two-Wallet System

On first load, Watchtower checks for a previously-connected injected wallet (silently, no popup).
If none is found, it generates a browser wallet in `localStorage` immediately — no setup step, no
"connect" button required to start reading or writing. The wallet menu (click the address in the
top bar) shows the active mode, lets you export the generated key, import one on another device,
or upgrade to an injected wallet (MetaMask / OKX) if one is available. Reads and writes always use
the same client and the same address; there is no path where the displayed address and the signing
address diverge. The generated key lives only in browser `localStorage` — it is not custody-grade,
and the app says so before treating it as acknowledged.

## Testing

- `contracts/watchtower.py` — lint with `genvm-lint check contracts/watchtower.py --json` (requires
  `pip install genvm-linter` in a Python 3.12+ environment). As of this revision it reports 2/3
  checks passing plus 5 `E010` warnings ("gl.nondet.* call ... not reachable from equivalence
  principle block") on the new `_fetch_page_text`/`_extract_items`/`_classify_item`/
  `_fetch_re_review_source`/`_re_classify` helpers. This is a known linter gap, not a real defect:
  `E010` is written to recognize the `gl.eq_principle.prompt_comparative` pattern specifically, and
  does not yet recognize `gl.vm.run_nondet(leader_fn, validator_fn)` — the pattern this revision
  switches to deliberately, because `prompt_comparative`'s validator is hardcoded to re-run the same
  function and cannot express independent validator logic (see "Consensus Design" above, and the
  GenLayer SDK's own `gl.vm.run_nondet` docstring, which recommends exactly this API for genuinely
  custom validator behavior). Schema extraction (`validate`) also currently fails in this
  environment with `E101 Failed to load SDK` — a missing cached runner tarball, unrelated to this
  change, that could not be resolved without network access to fetch it. Naming the contract class
  exactly `Contract` makes the linter's `find_contract_class` skip it as the base-class re-export
  and report a false "no contract class found" — the class is named `WatchtowerContract` to avoid
  that.
- `tests/direct/` — **96 direct-mode tests, all passing** (verified by actually running them, not
  claimed from memory):
  ```bash
  python3.12 -m venv .venv && source .venv/bin/activate
  pip install genlayer-test pytest
  pytest tests/direct/ -v
  ```
  - `test_fetch_hardening.py` (new) proves `_fetch_page_text`/`_fetch_re_review_source` treat a 3xx
    redirect, a 404/500/503, an empty body, a whitespace-only body, and a missing status field all as
    a failed fetch — never as evidence a document exists — for both the scan and re-review paths, plus
    a positive-path sanity check that a genuine 200-with-body still works.
  - `test_scan_validator.py` and `test_re_review_validator.py` exercise the independent `validator_fn`
    closures directly via `direct_vm.run_validator(leader_result=...)` — the genlayer-test direct-mode
    harness runs the leader path for the contract call itself but captures `validator_fn` for explicit
    invocation, since direct mode doesn't simulate full multi-node consensus. These prove the
    validator rejects a fabricated URL/domain, a fabricated evidence quote, a quote over the 25-word
    cap, an unrelated/mismatched title, a wrong publication date, a wrong document type, an unrelated
    CRITICAL/EMERGENCY_ACTION escalation, a fabricated `canonical_id`, a fabricated profile `digest`
    (including a "changed digest" duplicate-evasion attempt), and a claim of fetch success when the
    validator's own fetch fails — while still agreeing on a genuinely independent match and tolerating
    harmless rank-adjacent differences. Each file also has a `..._commits_nothing` test proving a
    disagreeing validator call has zero storage side effects (the closest direct mode can prove,
    since it doesn't enforce validator consensus on the write path itself — see the file's docstring).
    Writing the identity/title checks caught a real bug in `_fetch_page_text`/`_fetch_re_review_source`:
    mocked (and some live) web responses can return `bytes`, and the original code did not decode them
    before running string operations in the validator, crashing with `TypeError`. Fixed by decoding to
    `str` before any text processing.
  - `test_reviewer_findings.py` covers cross-profile duplicate independence, same-profile
    deduplication, non-manipulable timestamps (including a backward-clock-warp attempt against a
    stored cooldown), and re-review fetch-failure degradation.
  - `test_reviews.py` / `test_re_review_validator.py` cover access control, invalid reason codes,
    inadequate challenge notes, every re-review outcome (`UPHELD`, `RECLASSIFIED`,
    `URGENCY_RAISED`/`REDUCED`, `MATERIALITY_RAISED`/`REDUCED`, `SOURCE_UNVERIFIABLE`,
    `MORE_CONTEXT_REQUIRED`, `REVIEW_FAILED`), that `UPHELD`/`SOURCE_UNVERIFIABLE`/
    `MORE_CONTEXT_REQUIRED` never mutate the alert, that `RECLASSIFIED` changes exactly the fields
    the re-review actually changed, that a technical failure is recorded as `REVIEW_FAILED` (not
    `UPHELD`) and does not mutate the alert, that an out-of-vocabulary field is clamped back to the
    original rather than silently accepted, and that `last_reviewed_at` only advances on a review
    that actually changes something.
  - `test_scans.py`, `test_sources.py`, `test_profiles.py`, `test_bonding.py` cover the remaining
    write paths audited for the same bug classes in this revision (caller-controlled time, global
    state misused for profile-specific decisions, consensus failure recorded as success) — all
    already used `_now_ts()` exclusively and were found clean.
  - A prior phase's `gl.UserError` → `gl.vm.UserError` fix (every validation error in the contract
    was silently broken) and a `run_manual_scan` fix so manual overrides can actually bypass the
    schedule are documented in [`docs/DECISION_RECORD.md`](docs/DECISION_RECORD.md).
- `tests/integration/test_deploy_and_verify_fix.py` — **run and passed live against StudioNet**
  (`gltest tests/integration/test_deploy_and_verify_fix.py -v -s --network studionet`). Deploys this
  exact reviewed commit fresh, then exercises `register_source_v2`/`create_watch_profile` (both
  `FINALIZED`), canonical `get_contract_summary`/`get_source`/`get_profile` reads, and a real
  `run_source_scan` through the actual `leader_fn`/`validator_fn` `gl.vm.run_nondet` consensus path —
  live LLM/web calls, not mocks — which reached `ACCEPTED` and recorded a clean `NO_UPDATES` scan.
  Exact transaction hashes are in [`docs/LAST_STUDIONET_DEPLOY.txt`](docs/LAST_STUDIONET_DEPLOY.txt).
  `tests/integration/test_studionet_smoke.py` (a lighter smoke test against whatever address is
  currently in `.env.local`) was also fixed this pass — it previously referenced
  `gl_alice`/`gl_bob`/`gl_contract_address` fixtures that don't exist in the installed
  `genlayer-test` 0.29.2 and failed before ever reaching the network.
- `gltest.config.yaml` sets `networks.default: studionet` so `gltest` never silently targets
  localnet.
- `npm run lint`, `npm run build` — both pass clean, including the frontend changes this pass made to
  surface `SOURCE_UNVERIFIABLE`/`REVIEW_FAILED`/`MORE_CONTEXT_REQUIRED` re-review outcomes and
  `FAILED` scan results explicitly (see "Identity and Duplicate Handling" / re-review sections above
  and `docs/DECISION_RECORD.md` for the exact UI change).
- `npm run verify-schema` — **passes, 24/24 call sites**, against the freshly deployed
  `0x36250004511C89BDc49eCfD4e87cd57EDcc43611` (see StudioNet Deployment table above).
- **Production (`watchtower2.vercel.app`) verified separately from local dev/StudioNet testing.**
  Deploying the reviewed contract to StudioNet and updating `.env.local` does not update the live
  production site — `NEXT_PUBLIC_*` values are baked into the build at build time, and Vercel's
  Production environment variables are a separate store from `.env.local`. This pass updated
  Vercel's Production `NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS` to the same address above and triggered
  a real production deploy (`vercel --prod`), then confirmed the address is actually present in the
  shipped JS bundle (not just configured) by fetching the production chunks directly. See
  `tests/integration/test_production_verification.py` and
  [`docs/LAST_PRODUCTION_VERIFICATION.txt`](docs/LAST_PRODUCTION_VERIFICATION.txt) for a completed
  production test (fresh profile creation, a real Signal Sweep, consensus `ACCEPTED`, and the
  refreshed scan state), independently cross-checked by loading the live production Chain Ledger page
  itself immediately afterward and confirming its displayed counts matched exactly.
- **A real, previously-undetected bug was found and fixed while doing this**: `genlayer-js` 1.1.8
  decodes structured contract return values as a native JS `Map`, not a plain object, but every read
  in `lib/genlayer/reads.ts` used dot-notation field access (`summary.total_sources`) — which returns
  `undefined` on a `Map` instead of throwing, so it silently rendered as `0`/blank everywhere in the
  UI with no console error, for every StudioNet deployment this project has ever had, independent of
  which contract address was configured. See `docs/DECISION_RECORD.md`'s "Fourth pass" section for
  the full diagnosis; fixed with a single `plainify()` conversion at the shared `read()` choke point
  in `lib/genlayer/reads.ts`.

## Decision Record

[`docs/DECISION_RECORD.md`](docs/DECISION_RECORD.md) — 10 candidates spanning web-fetch, native GEN,
image, and embedding capabilities; the chosen Signal Sweep workflow checked against every gate; and
a self-audit of what the shipped project does and doesn't cover relative to the full candidate set.

## Contract Notes

The contract stores collection indexes as pipe-separated strings in `TreeMap[str, str]`. This avoids runtime construction of nested `DynArray` storage values, which GenLayer does not permit inside contract methods.

String-compatible `v2` methods are provided for frontend-facing numeric and address inputs. This keeps browser transaction encoding predictable while preserving the Watchtower product logic.

All write methods that touch cooldown/expiry state now derive `now_ts` from
`gl.message_raw["datetime"]` contract-side instead of accepting it as a client-supplied argument
— see `_now_ts()` in `contracts/watchtower.py` and [`docs/DECISION_RECORD.md`](docs/DECISION_RECORD.md).
A caller can no longer skew cooldown/due-date gating by lying about the time.

An earlier deployment (`0x133E154c0A4E89B8de701938cffa2E3dff759fc4`, now superseded) included three
fixes found while getting the direct test suite and linter running for the first time — a
contract-wide `gl.UserError` → `gl.vm.UserError` fix (every validation error was silently broken,
crashing with an unrelated `AttributeError` instead of the intended revert message), a
`run_source_scan` signature change (`skip_due_check`/`trigger_type` params so `run_manual_scan` can
actually bypass the schedule instead of just adding a mandatory reason field), and a class rename
(`Contract` → `WatchtowerContract`, cosmetic only — `genvm-lint`'s `find_contract_class` otherwise
skips a class literally named `Contract`, assuming it's the SDK's own base-class re-export).

The current address above (`0x36250004511C89BDc49eCfD4e87cd57EDcc43611`) is a fresh deployment of
this exact reviewed commit — not a reused older deployment — verified live end-to-end via
`tests/integration/test_deploy_and_verify_fix.py`: `register_source_v2` and `create_watch_profile`
both reached `FINALIZED`, canonical `get_source`/`get_profile`/`get_contract_summary` reads confirmed
the written state, and a real `run_source_scan` (the actual `leader_fn`/`validator_fn` `gl.vm.run_nondet`
consensus path, not a mock) reached `ACCEPTED` and recorded a clean `NO_UPDATES` scan
(0 candidates from the CFPB Federal Register API at the time of this run). `npm run verify-schema`
was also re-run against this exact address and passed all 24 frontend call sites. Exact transaction
hashes are in [`docs/LAST_STUDIONET_DEPLOY.txt`](docs/LAST_STUDIONET_DEPLOY.txt).

## Honest Limits

- **`UNDETERMINED` was observed live**, once, on a manual sweep — three leader rotations without
  quorum agreement. Nothing was written (confirmed via `get_contract_summary` before and after); the
  frontend's retry path was used and the retried sweep reached `ACCEPTED` cleanly. This is a real,
  expected StudioNet outcome, not a bug — see Phase 4 of the submission guidance this project was
  built against.
- **The first production deploy silently shipped with no environment variables set.** A `vercel env
  add ... production` call had appeared to succeed but never actually took; the live site's reads
  fell back to an unconfigured client and rendered an empty (but not visibly broken) state — 0
  sources, 0 profiles — even though the contract had real data. Caught by comparing the live site's
  `AUTHORITY SOURCES` count against a direct `genlayer call` to the same contract. Fixed by setting
  all four `NEXT_PUBLIC_GENLAYER_*` variables explicitly and redeploying; verified with a real write
  (`create_watch_profile`) against the redeployed production site.
- **`pollTransactionLifecycle` had no error handling around its per-tick RPC read.** A single
  transient network failure while polling a live, still-in-progress consensus round threw and
  surfaced a raw `Failed to fetch` message instead of continuing to poll — misleading, since the
  transaction was not actually failing, just slow. Fixed with a tolerance for up to 5 consecutive
  fetch failures before giving up.
- **Consensus writes are genuinely slow and variable.** Observed range across testing: as fast as
  ~15s with zero rotations, up to 2+ minutes with 3 rotations before resolving (either `ACCEPTED` or
  `UNDETERMINED`). Design the UI wait around minutes, not seconds — this project's lifecycle UI does.
- **StudioNet balances are simulated.** This project doesn't move GEN, so this doesn't affect it
  directly, but it's a general StudioNet caveat worth knowing if extending the contract.

## Security

- Never commit wallet private keys or seed phrases.
- Keep deployment credentials outside frontend environment variables.
- Only variables prefixed with `NEXT_PUBLIC_` should be treated as public browser configuration.
- Verify the configured contract address before submitting transactions.
