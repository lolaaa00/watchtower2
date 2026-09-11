# Decision Record — Watchtower

This is a retroactive decision record, written after the initial build, in the same spirit the
process asks for: generate broadly from the capability surface, apply the gates honestly, and
audit the result without flattering it.

## Candidates generated

1. **Regulatory Signal Sweep (chosen).** Fetch an official regulatory source, extract candidate
   items, and classify each against a company's watch profile (relevance, materiality, urgency,
   recommended action) via consensus. Capability: `gl.nondet.web.request` + `gl.nondet.exec_prompt`
   + `gl.eq_principle.prompt_comparative`.
2. **Insurance pool for false-positive compliance alerts.** Companies stake GEN into a shared pool;
   if a Signal Sweep alert is later overturned on appeal as fabricated, the pool pays the affected
   company a fixed penalty from the flagged source's bond. Capability: native GEN (staking, slashing,
   payable writes).
3. **Regulatory-document screenshot verifier.** Users submit a screenshot of a regulatory filing;
   the contract uses `render(mode="screenshot")` / `exec_prompt(images=[...])` to verify the
   screenshot matches the live official page before accepting it as evidence. Capability: images.
4. **Semantic regulation search index.** Ingest official regulatory text into on-chain embeddings
   (`genlayer_embeddings.VecDB`) and let compliance teams run `knn` semantic search across
   jurisdictions. Capability: embeddings.
5. **Keeper bonding for scan quality.** Keepers post a GEN bond to trigger scans; a bond is slashed
   if a scan is later proven (via re-review) to have missed a materially relevant item that a
   second keeper's scan of the same window catches. Capability: native GEN (bonding, slashing).
6. **Cross-jurisdiction conflict resolver.** Given two profiles operating in different jurisdictions,
   the contract judges whether a new regulation creates a conflicting obligation between them,
   using comparative consensus over both profiles at once.
7. **Escrowed compliance-review marketplace.** A company escrows GEN to have a human compliance
   reviewer countersign a contract verdict before it becomes actionable; escrow releases to the
   reviewer only if their countersignature agrees with consensus on outcome category, refunds
   otherwise. Capability: native GEN (escrow) + comparative consensus.
8. **Regulatory recall/safety-alert screenshot archive.** For product-recall and safety-alert
   sources that publish as images/PDFs rather than clean text, use `render(mode="screenshot")`
   plus `exec_prompt(images=[...])` to extract the recall details directly from the rendered page.
   Capability: images.
9. **Watch-profile similarity clustering.** Use embeddings to detect when two companies' watch
   profiles are similar enough that alerts should be cross-published, reducing duplicate scans
   across near-identical profiles. Capability: embeddings.
10. **Domain-name style registry of regulatory authorities.** A registry mapping authority names to
    canonical source URLs, resolved by consensus vote on which URL is authoritative. Rejected
    immediately at ideation — same shape as the name-service anti-pattern reviewers have already
    flagged ("a name service based on IC is not a proper GenLayer usecase").

## Chosen: Regulatory Signal Sweep

## Gate check

- **Gate A — counterfactual.** Delete GenLayer: a single operator (or their backend) decides
  whether a regulatory item applies to a company and how urgent it is, and every company relying
  on the feed must trust that operator not to under-report inconvenient obligations or over-report
  to justify its own value. With GenLayer, that judgment is made by independent validators under a
  stated equivalence principle, and the classification, the source item, and the reasoning are all
  on-chain and auditable.
- **Gate B — two distrusting parties.** The company relying on the alert feed, and the entity
  operating/keeper-triggering the scan. A company that pays attention to (or ignores) an alert is
  trusting that the classification wasn't quietly softened or inflated by whoever ran the scan.
- **Gate C — irreducibly semantic.** "Does this regulatory notice materially affect this specific
  company's specific products/jurisdictions/risk areas, and how urgently" is a judgment call, not
  a parse. No regex or keyword match reliably answers "is this MATERIAL vs POTENTIALLY_MATERIAL for
  a mid-size digital lender operating in three US states."
- **Gate D — evidence the contract fetches itself.** `leader()` calls `gl.nondet.web.request(src.url)`
  itself and extracts items from the fetched body; nothing about the source content is taken as a
  user-submitted claim. (Re-review still treats the *challenge note* as evidence of an objection,
  never as an instruction — see the prompt-injection framing added to both prompts.)
- **Gate E — would a stranger use this twice?** A compliance team with an active regulatory watch
  obligation checks new alerts on a rolling basis, not once. The profile/alert/action-item model is
  built around repeat use (open alerts, dismiss, escalate to an action item, come back later).
- **Gate F — path beyond submission.** More source adapters (per-jurisdiction), the keeper-bond
  idea from candidate 5, and the escrowed-reviewer marketplace from candidate 7 are natural
  extensions once the core sweep is proven; none require re-architecting the contract.
- **Gate G — latency budget.** One nondet round per scan (`gl.eq_principle.prompt_comparative`
  wraps a single `leader()` that does one web fetch + up to four `exec_prompt` calls: one
  extraction + up to three item judgments). Registration, profile creation, dismissal, and
  action-item management are all fully deterministic and settle in seconds; only the sweep itself
  is a consensus write, and it is explicitly a separate transaction from profile/source setup so a
  user is never blocked filling in a form. `run_source_scan` is permissionless — any keeper can
  trigger a due scan, and re-triggering doesn't block the profile owner.

## Self-audit

- **Distinct capabilities actually represented:** two — live web fetch (`gl.nondet.web.request`)
  and LLM judgment (`gl.nondet.exec_prompt`), unified under one `gl.eq_principle.prompt_comparative`
  call per nondet block. **This is the project's weakest point against the spec's own diversity
  requirement** ("at least two candidates must involve native value, and your set must span at
  least three capabilities" — that requirement is about the *candidate set*, which this record
  satisfies across 10 candidates, but the *shipped* project uses only one of the three
  underrepresented surfaces: none of native GEN, images, or embeddings).
- **Which two candidates are really the same idea twice:** 3 and 8 (screenshot-based evidence
  extraction) are the same capability applied to two different source shapes. 4 and 9 (embeddings)
  are also close — one is search, one is clustering, but both are "index profiles/regulations and
  compare via vector distance."
- **What would have been picked if web access did not exist:** candidate 5 (keeper bonding) or
  candidate 7 (escrowed reviewer) — both use native GEN as the primary trust mechanism instead of
  web-fetched evidence, and both still require a comparative judgment (was the scan actually
  missed / did the reviewer's countersignature agree), so neither collapses to a database problem
  without GenLayer.
- **Honest conclusion:** the chosen idea passes every hard gate (A–G) cleanly and is the strongest
  single-workflow candidate for "does a stranger understand this in one sentence and come back."
  But it under-uses the capability surface relative to the spec's exploration bar, and the
  strongest concrete next step for this project, if continued past this submission, is candidate 5
  or 7 layered on top of the existing alert/action-item model — both slot into the current schema
  without a rewrite.

## Non-determinism budget

Two nondet blocks in the whole contract, both now wrapped in `gl.eq_principle.prompt_comparative`
(previously `gl.vm.run_nondet_unsafe` with a validator that checked JSON shape only — a Fake
Consensus pattern, fixed in this revision):

1. `run_source_scan` → `leader()`: one `gl.nondet.web.request`, one extraction `exec_prompt`, up to
   three judgment `exec_prompt` calls (capped at 3 items per scan).
2. `request_re_review` → `leader()`: one re-evaluation `exec_prompt`.

Everything else — access control, IDs, indexing, cooldowns, arithmetic, storage — is deterministic.
The model is only ever asked what the source material says and what it means for the profile,
never what the contract should do with that answer; enum validation, clamping, and truncation of
model output all happen in deterministic code after the nondet call returns.

## Bug found and fixed during live verification

The first `_now_ts()` implementation read `gl.message.raw["datetime"]` — one of two accessors the
GenLayer docs list as equivalent (`gl.message.raw.datetime` / `gl.message_raw["datetime"]`). After
deploying to StudioNet and submitting a real `create_watch_profile` transaction, it reverted with
`AttributeError: 'MessageType' object has no attribute 'raw'` (confirmed via `genlayer receipt
<hash> --stdout --stderr`) — `gl.message.raw` doesn't exist on this runtime version, only the flat
`gl.message_raw["datetime"]` does. Fixed and redeployed; verified with a second live
`create_watch_profile` transaction that finalized successfully. This is exactly the kind of gap
direct-mode tests wouldn't have caught if the test harness's own `gl.message_raw` shim happened to
support the same (non-working) accessor the contract used — the StudioNet write was what actually
caught it.

## Resolved: timestamp trust

`now_ts` for every write that touches cooldown/expiry state (`create_watch_profile`,
`update_watch_profile`, `run_source_scan`, `run_manual_scan`, `request_re_review`,
`dismiss_alert`, `create_action_item`, `resolve_action`) is no longer a client-supplied argument.
It's derived contract-side by `_now_ts()`, which reads `gl.message_raw["datetime"]` — the
transaction-pinned, deterministic-across-validators timestamp — and parses it to epoch seconds. A
caller can no longer skew `next_due_at`/`cooldown_until` gating by lying about the time. The
read-only `is_scan_due` / `get_due_sources` views still accept a caller-supplied `now_ts`
deliberately — they don't mutate state, and a UI needs to ask "what if it were now" without
sending a transaction.

## Second bug found during live verification: CLI empty-string coercion

Registering the first test source via `genlayer write ... register_source_v2 --args "" "CFPB" ...`
(intending `""` to mean "auto-generate a source_id") sent the *integer* `0` instead — the
`genlayer` CLI's `--args` parser infers types from the raw string and treats `""` as `0`. All 5
StudioNet nodes deterministically hit the same crash (`AttributeError: 'int' object has no
attribute 'encode'` trying to store an int in a string field) and correctly reached `ACCEPTED`
consensus on the fact that the call reverts — nothing was written, confirmed via
`get_contract_summary` (`total_sources: 0`) before retrying. This is CLI-argument-parsing specific,
not a `genlayer-js` issue: the frontend's `client.writeContract({ args: [...] })` passes real JS
values, so a JS empty string is never coerced to a number. Fixed by passing an explicit source ID
instead of relying on the CLI to send an empty string.

## Critical bug found while getting the direct test suite running: `gl.UserError` does not exist

Writing and running the 32 direct-mode tests (previously blocked by a broken local Python
environment — see below) surfaced a bug more serious than anything caught by live testing:
`gl.UserError` is not a valid attribute — `genlayer.gl.__getattr__` only lazy-loads `nondet`,
`eq_principle`, `evm`, `advanced`, and `vm`; `UserError` itself lives at `gl.vm.UserError`. Every
one of the contract's 46 `raise gl.UserError(...)` call sites — every single validation error in
the entire contract, including `ONLY_OWNER`, `SOURCE_NOT_FOUND`, `INVALID_PROFILE`, and all the
rest — would crash with `AttributeError: module 'genlayer.gl' has no attribute 'UserError'`
instead of the intended message, on real StudioNet as much as in tests. This exact rule is
documented in the submission spec's own SDK gotchas ("Never `raise Exception` — use `raise
gl.vm.UserError(...)`") and was missed in the initial write and in every round of live testing
so far, because none of the writes exercised in this session happened to hit a validation branch
that reverts. Fixed with a global `gl.UserError` → `gl.vm.UserError` replace across all 46 sites.
**This means the contract deployed at the time of this fix (`0xB2001b012db55881F892Ffec8a87C96867043F82`)
has this bug live and must be redeployed before any further use.**

## Real product bug found by the same process: manual scan didn't actually override the schedule

`run_manual_scan` requires a `reason` and is presented in the UI as an urgent, ad-hoc override
("Urgent leadership request") — but it delegated to `run_source_scan`, which unconditionally
re-checked `next_due_at`. A manual scan could never actually run before the automatic schedule
allowed it; the "override" only added friction (a mandatory reason) without providing the
capability its name and UI copy implied. Writing `test_run_source_scan_cooldown_boundary` and
`test_run_source_scan_duplicate_digest_not_double_counted` — which needed to trigger a second scan
well before `next_due_at` (24h out) — surfaced this by making every naive approach fail with
`SOURCE_NOT_DUE`. Fixed by adding `skip_due_check`/`trigger_type` parameters to `run_source_scan`
(both deterministic, no consensus impact) and having `run_manual_scan` set
`skip_due_check=True, trigger_type="MANUAL_SCAN"`. `run_manual_scan` still enforces the cooldown
window (300s) and profile ownership — only the due-date schedule is bypassable, which is the
correct scope for "urgent manual override." Added `test_run_manual_scan_bypasses_due_date` as a
regression test. **`run_source_scan`'s arity changed (4 → 6 params, two with defaults) — the
frontend and `scripts/verify-schema.mjs` were updated to match, but this also requires a
redeploy.**

## Getting the test suite to actually run: three environment/config bugs, none in the contract

Fixing the sandbox's broken Python 3.12 (`pyexpat` linked against the wrong system `libexpat`,
which was blocking `pip` itself) surfaced three more issues once tests could finally execute,
all in test infrastructure, not the contract:

1. `gltest.config.yaml` had `default: studionet` at the file root. The real schema only accepts
   `networks`, `paths`, `environment` at root, and `paths` only accepts `contracts`/`artifacts` —
   `default` must nest inside `networks:`. Confirmed by reading the installed `gltest_cli` source
   directly rather than guessing.
2. `from .conftest import ...` (relative import) fails under pytest's default import mode without
   an `__init__.py`; switched to a plain `from conftest import ...`.
3. The actual `genlayer-test` fixture API differs from what the submission spec's own gotcha list
   implies: sender identity is set via `direct_vm.prank(address)` (context manager) or
   `direct_vm.sender = address`, never a `sender=` kwarg on the deploy/write call itself — those
   kwargs are forwarded straight into the contract's own method signature. `direct_alice` /
   `direct_bob` / `direct_charlie` are plain `Address` objects (`str(direct_bob)`, not
   `direct_bob.address`), and `expect_revert` is a `direct_vm` method
   (`with direct_vm.expect_revert(...)`), not a method on the address objects. All fixtures and
   tests were rewritten against the real, installed API rather than the assumed one.

## Live verification result

With both bugs fixed and the contract redeployed, a real `run_source_scan` was triggered from the
browser (generated wallet, not the deploy key — proving the permissionless-keeper design works)
against a live CFPB Federal Register source. It went through one leader rotation, then finalized:
`Consensus Result: Accepted`, execution `SUCCESS`, `Equivalence Principle Outputs` return value
`"[]"` (extraction genuinely found nothing in the queried date range — a valid `NO_UPDATES`
outcome, not a failure). On-chain state updated correctly: `total_scans: 1`, `last_error: ""`,
`cooldown_until`/`next_due_at` set from the message-derived clock. This confirms
`gl.eq_principle.prompt_comparative` reaches real multi-validator agreement in production, not just
in isolated deterministic writes. A run that actually surfaces a candidate item (and therefore
exercises the SCAN_PRINCIPLE's comparative judgment on relevance/materiality/urgency, not just the
extraction step) has not yet been observed and is worth testing with a source/date range known to
contain fresh content before submission.

## Reviewer rejection: "validators approve output vocabulary without checking source evidence"

The submission was rejected with specific, actionable feedback: validators were approving output
vocabulary without checking the source evidence or the regulatory decision itself, and coverage was
missing for timestamp manipulation, cross-profile duplicates, and re-review behavior. Rather than
guess at what this meant, the fix started by reading `genlayer/gl/eq_principle.py` directly (the
installed SDK, not documentation or memory) to understand exactly what `prompt_comparative`'s
`validator_fn` does: `my_res = fn()` — each validator independently re-executes the entire leader
closure, including its own `gl.nondet.web.request` fetch and its own LLM calls, before the
comparator ever runs. So independent fetching by validators was already happening structurally.
The real gaps were narrower and more concrete, and all three were real bugs, not just missing tests:

1. **The judgment step never saw the actual fetched page content.** `run_source_scan`'s
   `judgment_prompt` was built from `summary` — a field the *extraction* LLM call had generated one
   step earlier — never from `page_text`, the real fetched source. Two independent readers (leader
   and validator) could each independently derive a plausible-looking, vocabulary-matching verdict
   from a shared, possibly-lossy model-generated summary without either of them looking at the real
   document at classification time. Fixed by passing `page_text` directly into `judgment_prompt` and
   requiring `reason` to cite a specific, checkable detail from it — not a restatement of the summary
   or the chosen category labels.
2. **`request_re_review` never re-fetched anything.** Its leader closure had no `gl.nondet.web.request`
   call at all — it re-reasoned purely over the already-stored verdict labels and the challenge note.
   This is the most literal version of "approving vocabulary without checking evidence": a re-review
   is supposed to be an independent second look, and it wasn't looking at anything new. Fixed by
   having the leader re-fetch `a.official_url` and grounding the re-evaluation in that content, with
   an explicit `SOURCE_UNVERIFIABLE` outcome (deterministically enforced by the contract, not left to
   the model's honesty) when the re-fetch fails.
3. **`SCAN_PRINCIPLE` and `REVIEW_PRINCIPLE` only compared category labels.** Even with real evidence
   now flowing into both prompts, the comparator's own instructions previously accepted equivalence
   based on matching `document_type`/`relevance`/etc. categories alone. Both principles now require
   each side's `reason` to cite a specific, concrete detail from the source — two results with
   matching labels but generic or evidence-free reasoning are now explicitly **not** equivalent.

**A real, unrelated bug surfaced while fixing #1**: `seen_item_digests`, the dedup key preventing a
scan from double-counting the same source item, was keyed globally
(`source_id|official_url|title|pub_date`) — not scoped by `profile_id`. Since relevance is
profile-specific, this meant the *first* profile to scan a source item would silently suppress that
same item as a "duplicate" for every other profile that later scanned the same source, producing a
false `NO_UPDATES` for a genuinely relevant item. Fixed by scoping the digest with `profile_id`.
`test_same_item_creates_independent_alerts_for_different_profiles` is a regression test for exactly
this, and `test_same_item_same_profile_twice_is_still_deduped` confirms the fix didn't over-correct
(the same profile re-scanning the same item is still correctly deduped).

Six new tests in `tests/direct/test_reviewer_findings.py` cover the three categories the review
asked for directly: two for cross-profile duplicates (the bug above, both directions), two for
timestamp manipulation (`now_ts` has no client-supplied path anywhere in the ABI, and a backward
clock warp cannot be used to replay an earlier cooldown window), and two for re-review behavior
(fetch failure degrades deterministically to `SOURCE_UNVERIFIABLE` rather than trusting whatever the
model claims, and repeated re-review requests on one alert form an append-only audit trail rather
than overwriting or silently no-op'ing). All 50 direct tests pass; lint is clean (43 methods, 16
write). **Honest limit**: what a direct-mode test cannot prove is that the *prompt wording change*
itself measurably improves real model behavior — mocked LLM responses are fixed strings regardless
of what prompt produced them. That can only be observed live, by watching whether `reason` fields on
real StudioNet alerts actually cite source-specific detail post-fix, which is worth doing before
resubmission.

## Second rejection: structural fix, not a wording fix

The prior phase above (prompt/principle wording, digest scoping) was resubmitted and rejected again,
more specifically: "validators approve the output vocabulary without checking the source evidence or
the regulatory decision itself." The reviewer was right, and the root cause was architectural, not a
wording problem: `gl.eq_principle.prompt_comparative(fn, principle)` re-executes the *same* `fn` for
"validation" — there is no way to give the validator genuinely different logic from the leader inside
that API. No amount of prompt tuning changes that; both sides always run identical code against
whatever `fn` closed over. This phase replaces both non-deterministic blocks with
`gl.vm.run_nondet(leader_fn, validator_fn)`, the GenLayer SDK's own recommended primitive for
independent validator logic (confirmed by reading the installed SDK's `gl/vm.py` docstrings directly,
not assumed).

**What changed in `contracts/watchtower.py`:**

1. **`_run_scan_core`** — `leader_fn` fetches the source, extracts up to 3 candidate items (now
   requiring a verbatim `evidence_quote` field per item), and classifies each independently.
   `validator_fn` re-fetches the *same* source URL itself, then for each claimed item: checks the
   claimed `evidence_quote` is a literal substring of its own fetched text, checks the claimed
   `official_url` is on the registered source's own domain, checks the claimed `publication_date`
   (by year) appears in its own fetched text, requires `document_type` to match its own independent
   classification exactly, and requires `relevance`/`materiality`/`urgency`/`recommended_action` to
   fall within `RANK_TOLERANCE` (1) of its own classification on explicit rank orderings. A leader
   claiming fetch success while the validator's own fetch fails is rejected outright; both sides
   independently failing to fetch is accepted (conservative, no alert either way).
2. **`request_re_review`** — same `leader_fn`/`validator_fn` split against the alert's
   `official_url`. The outcome label is no longer taken from the model at all: the contract derives
   it deterministically from how the agreed classification's fields compare to the alert's original
   values (`UPHELD` iff nothing changed, `URGENCY_RAISED`/`REDUCED` iff urgency alone moved,
   `MATERIALITY_RAISED`/`REDUCED` iff materiality alone moved, `RECLASSIFIED` otherwise). This closes
   the exact bug class the rejection named for scans (vocabulary-valid but false) for re-review too:
   a model can no longer claim `URGENCY_RAISED` while urgency didn't actually increase, because the
   contract computes the label itself. A technical/consensus failure is now recorded as its own
   `REVIEW_FAILED` outcome — previously it fell into `outcome="UPHELD"`, which falsely implied a real
   re-evaluation had taken place and affirmed the original verdict, when in fact none had happened.
3. **Cross-profile duplicate identity** — replaced the single `seen_item_digests` map (already
   somewhat mitigated in the prior phase by scoping its digest string with `profile_id`) with two
   separate storage fields with distinct purposes: `canonical_items` (global, URL-based, presentation-
   independent — "has this document been seen at all") and `seen_profile_items` (profile-scoped,
   derived from the canonical id — "has this profile already alerted on this document"). This is a
   cleaner structural fix than digest-string concatenation: identity and alert-gating are now
   explicitly separate concepts instead of one overloaded string.

**Real bug caught by writing the new tests, not found by inspection**: `_fetch_page_text` (scan) and
`_fetch_re_review_source` (re-review) built page text as `web_data.body[:4000]` without checking
whether `.body` is `str` or `bytes`. Once `validator_fn` started doing real string work on that text
(`.lower()`, substring checks for the evidence quote and date), a `bytes` body crashed with
`TypeError: a bytes-like object is required, not 'str'` — caught immediately by
`test_scan_validator.py`'s validator tests, which mock a web response and then actually exercise the
validator via `direct_vm.run_validator()`. Fixed by decoding to `str` (UTF-8, replacing invalid
bytes) before any text processing in both helpers. This is exactly the kind of defect the previous,
vocabulary-only validator design could never have surfaced, since it never did any independent text
processing on fetched content at all.

**New tests** (74 direct-mode tests total, up from 50; all verified passing by actually running
`pytest tests/direct/ -v`, not claimed from memory):
- `tests/direct/test_scan_validator.py` (9 tests) — drives `_run_scan_core`'s `validator_fn` directly
  via `direct_vm.run_validator(leader_result=...)`, proving independent agreement, rejection of a
  fabricated URL/domain, a fabricated evidence quote, a wrong publication date, a wrong document
  type, an unrelated CRITICAL/EMERGENCY_ACTION escalation, tolerance of harmless rank-adjacent
  differences, and correct behavior when either side's fetch fails.
- `tests/direct/test_re_review_validator.py` (15 tests) — same pattern for `request_re_review`'s
  `validator_fn`, plus explicit coverage of every outcome the contract can derive (`UPHELD`,
  `URGENCY_RAISED`/`REDUCED`, `MATERIALITY_RAISED`/`REDUCED`, `RECLASSIFIED` — including that it
  updates exactly the fields that changed and nothing else, `SOURCE_UNVERIFIABLE`,
  `MORE_CONTEXT_REQUIRED`), plus that an out-of-vocabulary field from the model is clamped to the
  original rather than accepted, and that `last_reviewed_at` only advances on a review that actually
  changes the alert.
- `tests/direct/test_reviews.py` — the previous `..._malformed_outcome_falls_back_to_upheld` test was
  renamed and rewritten to assert the new, correct behavior (`outcome == "REVIEW_FAILED"`, alert
  untouched) instead of documenting the bug it used to have.
- Added a `get_review(review_id)` view method (`contracts/watchtower.py`) so tests (and eventually
  the frontend, if wanted) can read a review's recorded `outcome` directly rather than only inferring
  it from side effects on the alert.

**Verification actually run for this phase** (not claimed without running):
- `python3 -c "import ast; ast.parse(...)"` — syntax OK.
- `pytest tests/direct/ -v` — 74/74 passed.
- `genvm-lint check contracts/watchtower.py --json` — 2/3 checks pass; 5 `E010` warnings on the new
  nondet helper functions (the linter's reachability check is written for the
  `gl.eq_principle.prompt_comparative` pattern and does not yet recognize `gl.vm.run_nondet` as a
  valid non-deterministic block, despite it being the SDK's own recommended API for this exact case);
  schema validation additionally fails with `E101 Failed to load SDK` due to a missing cached runner
  tarball in this environment, unrelated to the contract change. Both are reported honestly rather
  than treated as passing.
- `npm run lint` — clean.
- `npm run build` — clean (Next.js typecheck + production build both succeed; no frontend files were
  touched this phase).
- `npm run verify-schema` — fails with `fetch failed`: this environment has no network access to the
  StudioNet RPC endpoint. Not run successfully; reported as a real gap, not skipped silently.
- StudioNet integration test (`tests/integration/test_studionet_smoke.py`) — **not run this phase**.
  It requires network access to StudioNet and a funded keystore, neither available in this
  environment. This is a genuine, stated limitation: the direct-mode suite proves the contract logic
  (validator independence, outcome derivation, identity scoping, timestamp authority) under mocked
  I/O, but the real non-deterministic path — actual LLM outputs, actual page fetches, actual
  multi-validator consensus rotation — has not been exercised against this revision. A human with
  StudioNet network access and a funded keystore should run
  `gltest tests/integration/ -v -s --network studionet` (and ideally redeploy and re-run a live scan
  + re-review) before treating this as fully proven end-to-end.

**What this phase deliberately did not do**: redesign the product, change the frontend beyond the
README, or add new user-facing features. The scope was the trust model — independent evidence
verification, profile-scoped identity, non-manipulable timestamps (already correct from the prior
phase, re-audited here and found still correct across every write method), and re-review outcome
integrity — not new functionality.
