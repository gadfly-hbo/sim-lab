import {
  DEFAULTS,
  MODEL_VERSION,
  buildRun,
  validateParams,
  computeInputHash,
  type SimLabParameters
} from '../kernel/index.js';
import {
  ExperimentStore,
  type ExperimentDraft,
  type Proposal,
  type StampedRun,
  type ExperimentSnapshot,
  type OperationReceipt,
  CASConflictError,
  ExperimentNotFoundError
} from '../store/index.js';

export class CaliberNotConfirmedError extends Error {
  constructor(experimentId: string, revision: number) {
    super(`Caliber not confirmed for revision ${revision} in experiment ${experimentId}. Simulation execution blocked.`);
    this.name = 'CaliberNotConfirmedError';
  }
}

export class AuthorityRequiredError extends Error {
  public credentialName: string;
  constructor(credentialName: string, message?: string) {
    super(message || `Authority credential [${credentialName}] is required for this operation. Agent self-call without host credentials blocked.`);
    this.name = 'AuthorityRequiredError';
    this.credentialName = credentialName;
  }
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency conflict for key [${key}]: existing operation has different inputs or revision.`);
    this.name = 'IdempotencyConflictError';
  }
}

export class InputHashMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`Input hash mismatch: requested ${expected}, but canonical draft hash is ${actual}`);
    this.name = 'InputHashMismatchError';
  }
}

export const UNSUPPORTED_KEYWORDS_REGEX = /(?:十个仓库|多仓|退货|真实销售概率|自动下单|账期融资)/i;

export class StaleProposalError extends Error {
  constructor(proposalId: string, baseRevision: number, currentRevision: number) {
    super(`Proposal ${proposalId} was based on revision ${baseRevision}, but current revision is ${currentRevision}.`);
    this.name = 'StaleProposalError';
  }
}

export class UnsupportedModelError extends Error {
  constructor(message = 'SimLab v0.2 是单仓确定性 FIFO 模型，不支持未建模的复杂退货/多仓/账期/概率预测机制') {
    super(message);
    this.name = 'UnsupportedModelError';
  }
}

export class UnknownOperationPendingError extends Error {
  public operationId: string;
  constructor(operationId: string) {
    super(`Experiment has an unsettled unknown operation [${operationId}]. Blind retry blocked. Must reconcile first.`);
    this.name = 'UnknownOperationPendingError';
    this.operationId = operationId;
  }
}

export interface RunOptions {
  faultMode?: 'normal' | 'unknown' | 'failed';
  cancelSignal?: AbortSignal;
  idempotencyKey?: string;
  inputHash?: string;
  modelVersion?: string;
  requestedEvidence?: string[];
  operationId?: string;
}

export class SimLabService {
  private store: ExperimentStore;

  constructor(store?: ExperimentStore) {
    this.store = store || new ExperimentStore();
  }

  public getStore(): ExperimentStore {
    return this.store;
  }

  public async getExperiment(id: string): Promise<ExperimentDraft> {
    const draft = await this.store.get(id);
    if (!draft) {
      throw new ExperimentNotFoundError(id);
    }
    return draft;
  }

  public async createExperiment(
    goal: string,
    name?: string,
    initialParams?: Partial<SimLabParameters>,
    hostAcceptanceRef?: string
  ): Promise<ExperimentDraft> {
    // Check unsupported capabilities in goal
    if (UNSUPPORTED_KEYWORDS_REGEX.test(goal) || (name && UNSUPPORTED_KEYWORDS_REGEX.test(name))) {
      throw new UnsupportedModelError();
    }

    const id = 'EXP-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const params: SimLabParameters = {
      ...DEFAULTS,
      ...initialParams,
      days: 30
    };
    validateParams(params);

    const draft: ExperimentDraft = {
      id,
      name: name || `实验_${new Date().toLocaleDateString('zh-CN')}`,
      goal,
      revision: 1,
      parameters: params,
      inputHash: computeInputHash(params),
      confirmedRevision: null,
      hostCredentials: {
        hostAcceptanceRef: hostAcceptanceRef || null
      },
      activeProposal: null,
      latestRun: null,
      snapshots: [],
      receipts: {},
      runSequence: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await this.store.save(draft);
  }

  public async updateParameters(
    id: string,
    params: Partial<SimLabParameters>,
    expectedRevision: number
  ): Promise<ExperimentDraft> {
    const draft = await this.getExperiment(id);
    if (draft.revision !== expectedRevision) {
      throw new CASConflictError(id, draft.revision, expectedRevision);
    }

    const merged: SimLabParameters = {
      ...draft.parameters,
      ...params,
      days: 30
    };
    validateParams(merged);

    draft.parameters = merged;
    draft.inputHash = computeInputHash(merged);
    draft.revision++;
    draft.confirmedRevision = null; // Invalidate confirmation
    if (draft.latestRun) {
      draft.latestRun.isStale = true;
    }
    draft.updatedAt = new Date().toISOString();

    return await this.store.save(draft, expectedRevision);
  }

  public async confirmCaliber(
    id: string,
    expectedRevision: number,
    hostReviewRef?: string,
    scopeHash?: string
  ): Promise<ExperimentDraft> {
    if (!hostReviewRef || typeof hostReviewRef !== 'string' || !hostReviewRef.trim()) {
      throw new AuthorityRequiredError('hostReviewRef', 'hostReviewRef is required for caliber confirmation');
    }

    const draft = await this.getExperiment(id);
    if (draft.revision !== expectedRevision) {
      throw new CASConflictError(id, draft.revision, expectedRevision);
    }

    draft.confirmedRevision = draft.revision;
    draft.hostCredentials.hostReviewRef = hostReviewRef;
    draft.updatedAt = new Date().toISOString();

    return await this.store.save(draft, expectedRevision);
  }

  public async proposePatch(
    id: string,
    promptOrPatch: string | Partial<SimLabParameters>
  ): Promise<Proposal> {
    const draft = await this.getExperiment(id);

    let patch: Partial<SimLabParameters> = {};
    let target = '';

    if (typeof promptOrPatch === 'string') {
      target = promptOrPatch;
      if (UNSUPPORTED_KEYWORDS_REGEX.test(promptOrPatch)) {
        throw new UnsupportedModelError();
      }

      // Regex matching for common proposals
      const capMatch = promptOrPatch.match(/(?:发货能力|产能)(?:改为|调整为|增加到|至)?\s*(\d+)/);
      const demandMatch = promptOrPatch.match(/(?:日单量|日需求|基础需求)(?:改为|调整为|增加到|至)?\s*(\d+)/);
      const priceMatch = promptOrPatch.match(/(?:售价|单价)(?:改为|调整为|至)?\s*(\d+)/);
      const costMatch = promptOrPatch.match(/(?:进价|成本|采购价)(?:改为|调整为|至)?\s*(\d+)/);
      const invMatch = promptOrPatch.match(/(?:初始库存|期初库存)(?:改为|调整为|至)?\s*(\d+)/);

      if (capMatch) patch.capacity = Number(capMatch[1]);
      if (demandMatch) patch.demand = Number(demandMatch[1]);
      if (priceMatch) patch.price = Number(priceMatch[1]);
      if (costMatch) patch.cost = Number(costMatch[1]);
      if (invMatch) patch.inventory = Number(invMatch[1]);

      if (Object.keys(patch).length === 0) {
        throw new UnsupportedModelError('未能从提议中识别出受支持的参数调整');
      }
    } else {
      patch = { ...promptOrPatch };
      target = '参数补丁提议';
    }

    const candidateParams = {
      ...draft.parameters,
      ...patch,
      days: 30 as const
    };
    validateParams(candidateParams);

    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && draft.parameters[k] !== v) {
        diff[k] = {
          before: draft.parameters[k],
          after: v
        };
      }
    }

    // Quantitative preview using actual kernel run
    const beforeRun = buildRun(draft.parameters);
    const afterRun = buildRun(candidateParams);

    const beforeSummary = beforeRun.results.baseline.summary;
    const afterSummary = afterRun.results.baseline.summary;

    const proposal: Proposal = {
      id: 'PROP-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      baseRevision: draft.revision,
      target,
      patch,
      diff,
      impact: {
        cash: afterSummary.minCash - beforeSummary.minCash,
        contribution: afterSummary.contribution - beforeSummary.contribution,
        fulfillmentRate: afterSummary.fulfillmentRate
      },
      explanation: `调整后基准情景最低现金变化 ${afterSummary.minCash - beforeSummary.minCash >= 0 ? '+' : ''}${afterSummary.minCash - beforeSummary.minCash} 元，贡献利润变化 ${afterSummary.contribution - beforeSummary.contribution >= 0 ? '+' : ''}${afterSummary.contribution - beforeSummary.contribution} 元`,
      createdAt: new Date().toISOString()
    };

    draft.activeProposal = proposal;
    draft.updatedAt = new Date().toISOString();
    await this.store.save(draft, draft.revision);

    return proposal;
  }

  public async adoptProposal(
    id: string,
    proposalId: string,
    expectedRevision: number,
    hostAcceptanceRef?: string,
    acceptedPreviewHash?: string
  ): Promise<ExperimentDraft> {
    if (!hostAcceptanceRef || typeof hostAcceptanceRef !== 'string' || !hostAcceptanceRef.trim()) {
      throw new AuthorityRequiredError('hostAcceptanceRef', 'hostAcceptanceRef is required for proposal adoption');
    }

    const draft = await this.getExperiment(id);
    if (draft.revision !== expectedRevision) {
      throw new CASConflictError(id, draft.revision, expectedRevision);
    }
    if (!draft.activeProposal || draft.activeProposal.id !== proposalId) {
      throw new Error(`Proposal ${proposalId} is not active in experiment ${id}`);
    }
    if (draft.activeProposal.baseRevision !== draft.revision) {
      throw new StaleProposalError(proposalId, draft.activeProposal.baseRevision, draft.revision);
    }

    const patch = draft.activeProposal.patch;
    const newParams: SimLabParameters = {
      ...draft.parameters,
      ...patch,
      days: 30
    };
    validateParams(newParams);

    draft.parameters = newParams;
    draft.inputHash = computeInputHash(newParams);
    draft.revision++;
    draft.confirmedRevision = null; // Invalidate confirmation
    draft.hostCredentials.hostAcceptanceRef = hostAcceptanceRef;
    if (draft.latestRun) {
      draft.latestRun.isStale = true;
    }
    draft.activeProposal = null;
    draft.updatedAt = new Date().toISOString();

    return await this.store.save(draft, expectedRevision);
  }

  public async discardProposal(id: string): Promise<ExperimentDraft> {
    const draft = await this.getExperiment(id);
    draft.activeProposal = null;
    draft.updatedAt = new Date().toISOString();
    return await this.store.save(draft, draft.revision);
  }

  public async runSimulation(
    id: string,
    expectedRevision: number,
    options: RunOptions = {}
  ): Promise<{ receipt: OperationReceipt; run: StampedRun | null }> {
    const draft = await this.getExperiment(id);

    // Check unknown operations blocking
    for (const r of Object.values(draft.receipts)) {
      if (r.stage === 'unknown' && !r.reconciled) {
        throw new UnknownOperationPendingError(r.operationId);
      }
    }

    if (draft.revision !== expectedRevision) {
      throw new CASConflictError(id, draft.revision, expectedRevision);
    }

    if (draft.confirmedRevision !== draft.revision) {
      throw new CaliberNotConfirmedError(id, draft.revision);
    }

    if (options.inputHash && options.inputHash !== draft.inputHash) {
      throw new InputHashMismatchError(options.inputHash, draft.inputHash);
    }

    if (options.idempotencyKey) {
      const existing = Object.values(draft.receipts).find(
        r => r.idempotencyKey === options.idempotencyKey
      );
      if (existing) {
        if (existing.revision === expectedRevision && existing.inputHash === draft.inputHash) {
          return { receipt: existing, run: draft.latestRun };
        } else {
          throw new IdempotencyConflictError(options.idempotencyKey);
        }
      }
    }

    const operationId = options.operationId || ('OP-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6));

    // Stage 1: Admitted
    const receipt: OperationReceipt = {
      operationId,
      experimentId: draft.id,
      type: 'run',
      revision: draft.revision,
      stage: 'admitted',
      executionStarted: false,
      reconciled: false,
      idempotencyKey: options.idempotencyKey,
      inputHash: draft.inputHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    draft.receipts[operationId] = receipt;

    // Check pre-calc cancellation
    if (options.cancelSignal?.aborted) {
      receipt.stage = 'cancelled';
      receipt.executionStarted = false;
      receipt.error = {
        code: 'CANCELLED_NOT_EXECUTED',
        message: 'Simulation cancelled before calculation started',
        retry: 'new_operation_allowed'
      };
      receipt.updatedAt = new Date().toISOString();
      await this.store.save(draft, draft.revision);
      return { receipt, run: draft.latestRun };
    }

    // Stage 2: Calc
    receipt.stage = 'calc';
    receipt.executionStarted = true;
    receipt.updatedAt = new Date().toISOString();

    if (options.faultMode === 'unknown') {
      receipt.stage = 'unknown';
      receipt.error = {
        code: 'STATE_UNKNOWN',
        message: 'Execution state unknown. Reconciliation query required.',
        retry: 'query_only'
      };
      receipt.updatedAt = new Date().toISOString();
      await this.store.save(draft, draft.revision);
      return { receipt, run: null };
    }

    if (options.faultMode === 'failed') {
      receipt.stage = 'failed';
      receipt.error = {
        code: 'EXECUTION_FAILED',
        message: 'Simulation execution failed due to injected fault.',
        retry: 'after_correction'
      };
      receipt.updatedAt = new Date().toISOString();
      await this.store.save(draft, draft.revision);
      return { receipt, run: null };
    }

    // Normal execution
    draft.runSequence++;
    const rawRun = buildRun(draft.parameters, draft.runSequence);

    // Stage 3: Settled
    const stampedRun: StampedRun = {
      runId: rawRun.id,
      revision: draft.revision,
      inputHash: computeInputHash(draft.parameters),
      modelVersion: MODEL_VERSION,
      isStale: false,
      operationId,
      payload: rawRun,
      createdAt: new Date().toISOString()
    };

    draft.latestRun = stampedRun;
    receipt.stage = 'settled';
    receipt.runId = stampedRun.runId;
    receipt.updatedAt = new Date().toISOString();

    await this.store.save(draft, draft.revision);
    return { receipt, run: stampedRun };
  }

  public async cancelSimulation(
    id: string,
    operationId: string,
    hostStopRef?: string
  ): Promise<OperationReceipt> {
    const draft = await this.getExperiment(id);
    const receipt = draft.receipts[operationId];
    if (!receipt) {
      throw new Error(`Operation ${operationId} not found in experiment ${id}`);
    }

    if (receipt.stage === 'admitted') {
      receipt.stage = 'cancelled';
      receipt.executionStarted = false;
      receipt.error = {
        code: 'CANCELLED_NOT_EXECUTED',
        message: 'Operation cancelled before calculation',
        retry: 'new_operation_allowed'
      };
    } else if (receipt.stage === 'calc') {
      receipt.stage = 'cancelled';
    }

    if (hostStopRef) {
      draft.hostCredentials.hostStopRef = hostStopRef;
    }
    receipt.updatedAt = new Date().toISOString();
    await this.store.save(draft, draft.revision);

    return receipt;
  }

  public async reconcileOperation(id: string, operationId: string): Promise<OperationReceipt> {
    const draft = await this.getExperiment(id);
    const receipt = draft.receipts[operationId];
    if (!receipt) {
      throw new Error(`Operation ${operationId} not found in experiment ${id}`);
    }

    if (receipt.stage === 'unknown') {
      // Reconcile and recover
      draft.runSequence++;
      const rawRun = buildRun(draft.parameters, draft.runSequence);
      const stampedRun: StampedRun = {
        runId: rawRun.id,
        revision: receipt.revision,
        inputHash: computeInputHash(draft.parameters),
        modelVersion: MODEL_VERSION,
        isStale: false,
        operationId,
        payload: rawRun,
        createdAt: new Date().toISOString()
      };
      draft.latestRun = stampedRun;
      receipt.stage = 'settled';
      receipt.reconciled = true;
      receipt.runId = stampedRun.runId;
      receipt.updatedAt = new Date().toISOString();
      await this.store.save(draft, draft.revision);
    }

    return receipt;
  }

  public async freezeSnapshot(
    id: string,
    hostFreezeRef?: string,
    expectedRevision?: number
  ): Promise<ExperimentSnapshot> {
    if (!hostFreezeRef || typeof hostFreezeRef !== 'string' || !hostFreezeRef.trim()) {
      throw new AuthorityRequiredError('hostFreezeRef', 'hostFreezeRef is required for snapshot creation');
    }

    const draft = await this.getExperiment(id);
    if (expectedRevision !== undefined && draft.revision !== expectedRevision) {
      throw new CASConflictError(id, draft.revision, expectedRevision);
    }
    if (!draft.latestRun) {
      throw new Error('No simulation run available to snapshot');
    }
    if (draft.latestRun.isStale) {
      throw new Error('Latest run is stale. Please re-run simulation before creating snapshot.');
    }

    // Deduplication check: existing snapshot for same (runId, revision)
    const existing = draft.snapshots.find(
      s => s.runId === draft.latestRun!.runId && s.revision === draft.revision
    );
    if (existing) {
      return existing;
    }

    // Limit to max 10 snapshots (FIFO)
    if (draft.snapshots.length >= 10) {
      draft.snapshots.shift();
    }

    const snapshotId = `SNAP-${String(draft.snapshots.length + 1).padStart(3, '0')}-${Date.now().toString(36)}`;
    const snapshot: ExperimentSnapshot = {
      id: snapshotId,
      experimentId: draft.id,
      runId: draft.latestRun.runId,
      revision: draft.revision,
      inputHash: draft.latestRun.inputHash,
      modelVersion: MODEL_VERSION,
      parameters: { ...draft.parameters },
      confirmedRevision: draft.confirmedRevision ?? draft.revision,
      hostFreezeRef,
      summary: { ...draft.latestRun.payload.results.baseline.summary },
      createdAt: new Date().toISOString()
    };

    draft.snapshots.push(snapshot);
    draft.hostCredentials.hostFreezeRef = hostFreezeRef;
    draft.updatedAt = new Date().toISOString();
    await this.store.save(draft, draft.revision);

    return snapshot;
  }

  public async listSnapshots(id: string): Promise<ExperimentSnapshot[]> {
    const draft = await this.getExperiment(id);
    return draft.snapshots;
  }

  public async getOperation(operationId: string): Promise<OperationReceipt | null> {
    const exps = await this.store.list();
    for (const item of exps) {
      const draft = await this.store.get(item.id);
      if (draft?.receipts[operationId]) {
        return draft.receipts[operationId];
      }
    }
    return null;
  }

  public async getRun(runId: string): Promise<{ run: StampedRun; historical: boolean; experimentId: string } | null> {
    const exps = await this.store.list();
    for (const item of exps) {
      const draft = await this.store.get(item.id);
      if (draft?.latestRun?.runId === runId) {
        return { run: draft.latestRun, historical: draft.latestRun.isStale, experimentId: draft.id };
      }
      for (const snap of draft?.snapshots || []) {
        if (snap.runId === runId) {
          return {
            run: {
              runId: snap.runId,
              revision: snap.revision,
              inputHash: snap.inputHash,
              modelVersion: snap.modelVersion,
              isStale: true,
              operationId: 'OP-HISTORICAL',
              payload: buildRun(snap.parameters),
              createdAt: snap.createdAt
            },
            historical: true,
            experimentId: draft!.id
          };
        }
      }
    }
    return null;
  }

  public async getSnapshot(snapshotId: string): Promise<ExperimentSnapshot | null> {
    const exps = await this.store.list();
    for (const item of exps) {
      const draft = await this.store.get(item.id);
      const snap = draft?.snapshots.find(s => s.id === snapshotId);
      if (snap) return snap;
    }
    return null;
  }

  public async readEvidence(
    runId: string,
    scenarioId: 'baseline' | 'advance' | 'split',
    kind: 'summary' | 'day' | 'ledger' | 'thresholds' | 'sensitivity' | 'conservation',
    day?: number
  ): Promise<unknown> {
    const runInfo = await this.getRun(runId);
    if (!runInfo) return null;
    const res = runInfo.run.payload.results[scenarioId];
    if (!res) return null;

    if (kind === 'summary') {
      return { scenario: scenarioId, summary: res.summary, units: 'CNY / pieces / ratio' };
    }
    if (kind === 'day' || kind === 'ledger') {
      if (day !== undefined) {
        const record = res.records.find(r => r.day === day);
        return record ? { scenario: scenarioId, day, record } : null;
      }
      return { scenario: scenarioId, records: res.records };
    }
    if (kind === 'thresholds') {
      return {
        scenario: scenarioId,
        thresholds: {
          minCash: res.summary.minCash,
          minCashDay: res.summary.minCashDay,
          peakBacklog: res.summary.peakBacklog,
          peakBacklogDay: res.summary.peakBacklogDay,
          stockoutDays: res.summary.stockoutDays,
          firstStockout: res.summary.firstStockout
        }
      };
    }
    if (kind === 'sensitivity') {
      return { scenario: scenarioId, sensitivity: runInfo.run.payload.sensitivity[scenarioId] };
    }
    if (kind === 'conservation') {
      return { scenario: scenarioId, valid: res.summary.valid, residual: 0 };
    }
    return null;
  }

  public async restoreDraft(id: string, snapshotId: string): Promise<ExperimentDraft> {
    const draft = await this.getExperiment(id);
    const snap = draft.snapshots.find(s => s.id === snapshotId);
    if (!snap) {
      throw new Error(`Snapshot ${snapshotId} not found in experiment ${id}`);
    }

    draft.parameters = { ...snap.parameters };
    draft.inputHash = computeInputHash(draft.parameters);
    draft.revision++;
    draft.confirmedRevision = null;
    if (draft.latestRun) {
      draft.latestRun.isStale = true;
    }
    draft.updatedAt = new Date().toISOString();

    return await this.store.save(draft, draft.revision - 1);
  }
}
