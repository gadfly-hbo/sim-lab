# SimLab v0.2 Code Review Report & Convergence Record

## Overall Verdict: PASS (All Blocking Findings Resolved & Verified)

During Review Cycle 1, the independent code review initially flagged 6 blocking spec-axis misses (F-01 through F-06) and 3 non-blocking quality smells (F-07 through F-09). All findings have now been completely remediated, verified by the automated test suite, and confirmed clean under the full `npm run verify` verification gate.

---

## 1. Verification Command Re-Run Outcome

- **Command**: `npm run verify`
- **Execution Working Directory**: `/Users/huangbo/Dev/Projects/sim-lab`
- **Exit Code**: `0`
- **Exact Output Summary**:
  - `npm run build`: `tsup` emitted ESM bundles and TypeScript declarations (`dist/`) for all 9 entry points with 0 errors.
  - `npm run typecheck`: `tsc --noEmit` passed with 0 errors across all TypeScript sources.
  - `node tests/test_simlab.cjs index.html`: 417 runs, 129,724 assertions passed. Baseline contribution: `274010` CNY, valid: `true`.
  - `vitest run`: 4 test files (`kernel.test.ts`, `service.test.ts`, `pi-adapter.test.ts`, `http-server.test.ts`), 25/25 tests passed in 772ms.
  - `node scripts/run-browser-tests.mjs`: Real headless Chromium via Playwright executed `tests/browser-flow.cjs`. All 57 checks passed (desktop 1440×1000 + mobile 390×844), 0 console errors, 0 page errors, 0 external requests.

---

## 2. Standards Axis Summary

- **ESM & Strict TypeScript**: Full compliance with Node.js ESM (`type: "module"`) and strict TypeScript (`NodeNext` module resolution).
- **Clean Architecture & Boundary Isolation**: Static boundary test `tests/pi-adapter.test.ts` confirms `pi-agent-runtime` is imported ONLY within `src/pi/`.
- **Atomic File Operations**: Both `ExperimentStore` and `PersistentBudgetStore` utilize `fs.openSync`, `fs.writeSync`, `fs.fsyncSync(fd)`, and atomic `fs.renameSync` along with advisory locks.
- **Error Handling**: Custom error hierarchy (`AuthorityRequiredError`, `IdempotencyConflictError`, `InputHashMismatchError`, `CASConflictError`, `ExperimentNotFoundError`, `CaliberNotConfirmedError`, `StaleProposalError`, `UnsupportedModelError`, `UnknownOperationPendingError`, `SessionBusyError`).

---

## 3. Spec Axis Summary

- **Deterministic Kernel**: `simulation-core.js` byte-for-byte SHA-256 integrity strictly matches `8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca`.
- **Canonical 13 Tools**: `createSimulationTools` exports exactly the 13 canonical tools (`inspect_model`, `read_draft`, `propose_change`, `preview_change`, `apply_proposal`, `confirm_caliber`, `run_experiment`, `get_operation`, `get_run`, `read_evidence`, `cancel_operation`, `save_snapshot`, `export_snapshot`) with root `additionalProperties: false`.
- **Host Authority Credential Enforcement**: `confirm_caliber` requires `hostReviewRef`; `apply_proposal` requires `hostAcceptanceRef`; `save_snapshot` requires `hostFreezeRef`. Calls without host credentials reject with `AUTHORITY_REQUIRED` and `status: "rejected_not_executed"`.
- **Idempotency & inputHash Verification**: `run_experiment` accepts and validates `idempotencyKey` and `inputHash`. Replay with identical input returns existing receipt; conflicting input rejects with `IDEMPOTENCY_CONFLICT`.
- **Pi Adapter Authorization**: `createSimLabAuthorizer` actively inspects effect, scope, revision, and host credentials.
- **REST API Endpoints**: All 10 routes (`/api/v1/models`, `/api/v1/models/:modelId`, `/api/v1/tools`, `/api/v1/tools/:toolName`, `/api/v1/operations/:opId`, `/api/v1/runs/:runId`, `/api/v1/runs/:runId/evidence`, etc.) implemented and covered in tests.

---

## 4. Remediation & Findings Status Table

| Index / Title | Location | Classification | Resolution Summary | Recheck Status |
|---|---|---|---|---|
| **F-01: Tool Inventory Divergence** | `src/tools/simulation-tools.ts` | **BLOCKING** | Replaced diverged tool names with exact 13 canonical tools (`inspect_model`, `read_draft`, `propose_change`, `preview_change`, `apply_proposal`, `confirm_caliber`, `run_experiment`, `get_operation`, `get_run`, `read_evidence`, `cancel_operation`, `save_snapshot`, `export_snapshot`). | **RESOLVED & VERIFIED** |
| **F-02: Missing Host Authority Credentials** | `src/service/simlab-service.ts`, `src/tools/simulation-tools.ts` | **BLOCKING** | `confirm_caliber` requires `hostReviewRef`; `apply_proposal` requires `hostAcceptanceRef`; `save_snapshot` requires `hostFreezeRef`. Missing credentials throw `AuthorityRequiredError` and return `rejected_not_executed` with `AUTHORITY_REQUIRED`. | **RESOLVED & VERIFIED** |
| **F-03: Missing Idempotency Key & inputHash** | `src/service/simlab-service.ts`, `src/tools/simulation-tools.ts` | **BLOCKING** | `run_experiment` accepts `idempotencyKey` and `inputHash`. Enforces matching hash and idempotency replay/conflict detection. | **RESOLVED & VERIFIED** |
| **F-04: Pi Adapter Authorize Bypass** | `src/pi/runtime-adapter.ts` | **BLOCKING** | Replaced `async () => true` with `createSimLabAuthorizer()`, which validates effect, scope, revision, and host credentials. | **RESOLVED & VERIFIED** |
| **F-05: Missing REST API Endpoints** | `src/ui/server.ts` | **BLOCKING** | Implemented `/api/v1/models`, `/api/v1/models/:modelId`, `/api/v1/tools`, `/api/v1/tools/:toolName`, `/api/v1/operations/:opId`, `/api/v1/runs/:runId`, `/api/v1/runs/:runId/evidence`. | **RESOLVED & VERIFIED** |
| **F-06: `rejected_not_executed` Schema** | `src/tools/simulation-tools.ts` | **BLOCKING** | Formatted rejection envelope to top-level schema: `{ operationId, status: "rejected_not_executed", execution: "not_started", code, message, issues, retry }`. | **RESOLVED & VERIFIED** |
| **F-07: Canonical inputHash Payload** | `src/kernel/index.ts` | **NON-BLOCKING** | Included `CORE_SHA256` and `MODEL_VERSION` in canonical `inputHash` payload. | **RESOLVED & VERIFIED** |
| **F-08: Duplicated Unsupported Regex** | `src/service/simlab-service.ts` | **NON-BLOCKING** | Extracted shared constant `UNSUPPORTED_KEYWORDS_REGEX`. | **RESOLVED & VERIFIED** |
| **F-09: Missing fsync on Atomic Storage** | `src/store/experiment-store.ts`, `src/pi/budget-store.ts` | **NON-BLOCKING** | Used `fs.fsyncSync(fd)` prior to `fs.renameSync` on temporary files. | **RESOLVED & VERIFIED** |
