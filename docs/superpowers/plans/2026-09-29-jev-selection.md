# Jev selection experiment implementation plan

Goal: Add an opt-in offline comparison of Jev and the existing selector, without changing publication.
Architecture: pure typed judgment/policy module; receipt-backed provider; CLI reusing the gold format and SelectBench import. The original selector remains the baseline. No Jev model in the global generation-model registry.
Spec: docs/jev-selection.md (approved scope: fork, experimental branch, compare before takeover).
Tech: Node >=24.11, TypeScript, PostgreSQL, existing receipts and budgets.

## Constraints and review focus
- Never treat errors or abstentions as content rejection. Report coverage and conservative end-to-end recall.
- Unknown/missing evidence and uncertain cap signals lead to review; no secret or gold label enters model state.
- Every paid request uses receipts, a bounded response, timeout and seeded budget. No automatic resend of an unknown outcome.
- Cache identity includes request, endpoint, model, policy; no arbitrary public URL accepts a credential.
- Empty/duplicate/invalid gold sets and invalid CLI limits fail before paid requests. Never fabricate human gold.

## Tasks
- [x] 1. Tests for semantic response validation, weighted decisions, review states, cap rules and evaluation denominators; implement pure policy.
- [x] 2. Tests against local HTTP and real PostgreSQL for native transport, valve, cache, malformed responses, budget and uncertain failure; implement provider and migration.
- [x] 3. Implement gold CLI, baseline comparison, report/SelectBench persistence and dry-run; test actual CLI with local providers.
- [x] 4. Typecheck, backend tests, web build/tests, read-only smoke if runtime works; review branch, commit and push.

Execution: inline, using executing-plans and TDD. Human-label quality evaluation remains pending until real reviewed gold is available. No deployment or production takeover.

## Execution record
- 2026-09-29: Pure policy RED (missing module) -> GREEN 8 tests. Hand-calculated test expectations corrected: model weights yielded 64, marketing sig cap yielded 62; T2 used for rejection case.
- Provider RED -> GREEN 5 tests with local HTTP and PostgreSQL.
- CLI RED -> GREEN, including actual child-process run, receipt reuse, report import, no analyses writes.
- Review regression tests first reproduced inherited-property choice acceptance and baseline refusal counted as reject; both corrected.
- Native Node runtime mismatch fixed by installing locked dependencies with Node 24.19.0. No dependency versions changed.
- Full backend suite 153/153, web suite 13/13, typecheck including new CLI, web build and HTTP smoke passed. Browser tested review filter, row expansion and 390px/1440px viewports.
- Ruling: Keep scope offline-only. Human gold and paid model quality comparison remain pending; 150 public feed candidates prepared locally with null labels.
- Ruling: Original double-score baseline preserved; Jev uses one multi-question request. Do not represent this as calibrated or compare cost without actual receipts.
