import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SimLabService,
  CaliberNotConfirmedError,
  UnsupportedModelError,
  UnknownOperationPendingError,
  AuthorityRequiredError,
  IdempotencyConflictError,
  InputHashMismatchError
} from '../src/service/simlab-service.js';
import { ExperimentStore, CASConflictError } from '../src/store/experiment-store.js';

describe('Seam S2: Transactional File Store & SimLab Application Service', () => {
  let tmpDir: string;
  let store: ExperimentStore;
  let service: SimLabService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simlab-test-'));
    store = new ExperimentStore(tmpDir);
    service = new SimLabService(store);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('creates an experiment draft and verifies atomic persistence in temp dir', async () => {
    const draft = await service.createExperiment('大促备货方案分析', '方案 A', { demand: 200 }, 'HOST-ACCEPT-001');
    expect(draft.id).toBeDefined();
    expect(draft.revision).toBe(1);
    expect(draft.confirmedRevision).toBeNull();
    expect(draft.parameters.demand).toBe(200);
    expect(draft.hostCredentials.hostAcceptanceRef).toBe('HOST-ACCEPT-001');

    // Verify stored file directly
    const stored = await store.get(draft.id);
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(draft.id);
    expect(stored?.parameters.demand).toBe(200);
  });

  it('enforces CAS check and rejects stale revision updates', async () => {
    const draft = await service.createExperiment('测试 CAS');
    expect(draft.revision).toBe(1);

    // Stale revision 0 should fail
    await expect(service.updateParameters(draft.id, { capacity: 300 }, 0)).rejects.toThrow(CASConflictError);

    // Valid revision 1 succeeds and advances to 2
    const updated = await service.updateParameters(draft.id, { capacity: 300 }, 1);
    expect(updated.revision).toBe(2);
    expect(updated.parameters.capacity).toBe(300);
  });

  it('blocks simulation execution when caliber is not confirmed', async () => {
    const draft = await service.createExperiment('未确认口径测试');
    await expect(service.runSimulation(draft.id, draft.revision)).rejects.toThrow(CaliberNotConfirmedError);

    // Authority required check
    await expect(service.confirmCaliber(draft.id, draft.revision)).rejects.toThrow(AuthorityRequiredError);

    // Confirm caliber with valid hostReviewRef
    await service.confirmCaliber(draft.id, draft.revision, 'HOST-REVIEW-001');
    const { receipt, run } = await service.runSimulation(draft.id, draft.revision);
    expect(receipt.stage).toBe('settled');
    expect(run).not.toBeNull();
    expect(run?.payload.validationPassed).toBe(true);
    expect(run?.payload.results.baseline.summary.contribution).toBe(274010);
  });

  it('quantifies proposal impact using actual kernel diff and invalidates confirmation on adopt', async () => {
    const draft = await service.createExperiment('提案影响量化测试');
    await service.confirmCaliber(draft.id, 1, 'HOST-REVIEW-001');
    await service.runSimulation(draft.id, 1);

    // Propose patch
    const proposal = await service.proposePatch(draft.id, '将日发货能力改为300');
    expect(proposal.patch.capacity).toBe(300);
    expect(proposal.diff.capacity).toEqual({ before: 250, after: 300 });

    // Verify impact diff is real kernel difference
    const beforeExp = await service.getExperiment(draft.id);
    expect(beforeExp.parameters.capacity).toBe(250); // Live params unaffected

    // Discard keeps parameters unchanged
    await service.discardProposal(draft.id);
    const afterDiscard = await service.getExperiment(draft.id);
    expect(afterDiscard.activeProposal).toBeNull();
    expect(afterDiscard.parameters.capacity).toBe(250);

    // Propose again and adopt
    const prop2 = await service.proposePatch(draft.id, '将日发货能力改为300');
    // Reject without host credential
    await expect(service.adoptProposal(draft.id, prop2.id, 1)).rejects.toThrow(AuthorityRequiredError);

    const adopted = await service.adoptProposal(draft.id, prop2.id, 1, 'HOST-ACCEPT-001');
    expect(adopted.revision).toBe(2);
    expect(adopted.parameters.capacity).toBe(300);
    expect(adopted.confirmedRevision).toBeNull(); // Confirmation invalidated
    expect(adopted.latestRun?.isStale).toBe(true); // Prior run stale
  });

  it('deduplicates snapshots on same runId/revision and bounds max snapshots to 10', async () => {
    const draft = await service.createExperiment('快照测试');
    await service.confirmCaliber(draft.id, 1, 'HOST-REVIEW-001');
    await service.runSimulation(draft.id, 1);

    // Authority required on freeze
    await expect(service.freezeSnapshot(draft.id)).rejects.toThrow(AuthorityRequiredError);

    // Freeze snapshot
    const snap1 = await service.freezeSnapshot(draft.id, 'HOST-FREEZE-1');
    expect(snap1.revision).toBe(1);

    // Duplicate snapshot returns same snapshot without expanding array
    const snap2 = await service.freezeSnapshot(draft.id, 'HOST-FREEZE-1');
    expect(snap2.id).toBe(snap1.id);
    const list = await service.listSnapshots(draft.id);
    expect(list).toHaveLength(1);

    // Advance 11 revisions and snapshots to test bound of 10
    for (let r = 2; r <= 12; r++) {
      await service.updateParameters(draft.id, { capacity: 250 + r }, r - 1);
      await service.confirmCaliber(draft.id, r, 'HOST-REVIEW-001');
      await service.runSimulation(draft.id, r);
      await service.freezeSnapshot(draft.id, 'HOST-FREEZE-' + r);
    }

    const snaps = await service.listSnapshots(draft.id);
    expect(snaps.length).toBeLessThanOrEqual(10);
  });

  it('handles cancel before calculation and unknown fault reconciliation', async () => {
    const draft = await service.createExperiment('取消与恢复测试');
    await service.confirmCaliber(draft.id, 1, 'HOST-REVIEW-001');

    // 1. Cancel before calculation
    const abortCtrl = new AbortController();
    abortCtrl.abort();
    const cancelRes = await service.runSimulation(draft.id, 1, { cancelSignal: abortCtrl.signal });
    expect(cancelRes.receipt.stage).toBe('cancelled');
    expect(cancelRes.receipt.executionStarted).toBe(false);

    // 2. Unknown fault injection
    const unknownRes = await service.runSimulation(draft.id, 1, { faultMode: 'unknown' });
    expect(unknownRes.receipt.stage).toBe('unknown');
    expect(unknownRes.receipt.executionStarted).toBe(true);
    expect(unknownRes.run).toBeNull();

    // Blind retry must be blocked
    await expect(service.runSimulation(draft.id, 1)).rejects.toThrow(UnknownOperationPendingError);

    // Reconcile recovers execution without rerun
    const reconciled = await service.reconcileOperation(draft.id, unknownRes.receipt.operationId);
    expect(reconciled.stage).toBe('settled');
    expect(reconciled.reconciled).toBe(true);

    const restoredDraft = await service.getExperiment(draft.id);
    expect(restoredDraft.latestRun).not.toBeNull();
    expect(restoredDraft.latestRun?.runId).toBe(reconciled.runId);
  });

  it('honestly rejects unmodeled requests (unsupported model capabilities)', async () => {
    await expect(service.createExperiment('请自动优化十个仓库并下单')).rejects.toThrow(UnsupportedModelError);

    const draft = await service.createExperiment('有效方案');
    await expect(service.proposePatch(draft.id, '请预测真实销售概率并退货回仓')).rejects.toThrow(UnsupportedModelError);
  });

  it('validates canonical inputHash and enforces idempotency replay and conflict detection', async () => {
    const draft = await service.createExperiment('幂等与哈希核验测试');
    await service.confirmCaliber(draft.id, 1, 'HOST-REVIEW-001');

    // 1. inputHash mismatch
    await expect(service.runSimulation(draft.id, 1, { inputHash: 'sha256:wrong-hash' })).rejects.toThrow(InputHashMismatchError);

    // 2. valid run with idempotency key
    const res1 = await service.runSimulation(draft.id, 1, {
      inputHash: draft.inputHash,
      idempotencyKey: 'IDEMP-001'
    });
    expect(res1.receipt.stage).toBe('settled');

    // 3. idempotent replay with same key and same inputs returns existing receipt
    const res2 = await service.runSimulation(draft.id, 1, {
      inputHash: draft.inputHash,
      idempotencyKey: 'IDEMP-001'
    });
    expect(res2.receipt.operationId).toBe(res1.receipt.operationId);

    // 4. advance revision and attempt same idempotency key -> conflict
    await service.updateParameters(draft.id, { capacity: 300 }, 1);
    await service.confirmCaliber(draft.id, 2, 'HOST-REVIEW-002');
    const updatedDraft = await service.getExperiment(draft.id);
    await expect(service.runSimulation(draft.id, 2, {
      inputHash: updatedDraft.inputHash,
      idempotencyKey: 'IDEMP-001'
    })).rejects.toThrow(IdempotencyConflictError);
  });
});
