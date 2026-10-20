import {
  DEFAULTS,
  MODEL_VERSION,
  PARAM_RULES,
  SCENARIOS,
  CORE_SHA256,
  buildRun,
  simulate,
  computeInputHash,
  type SimLabParameters
} from '../kernel/index.js';
import {
  SimLabService,
  CaliberNotConfirmedError,
  CASConflictError,
  UnsupportedModelError,
  UnknownOperationPendingError,
  StaleProposalError,
  AuthorityRequiredError,
  IdempotencyConflictError,
  InputHashMismatchError
} from '../service/index.js';

export interface SimLabTool {
  name: string;
  description: string;
  effect: 'read' | 'write' | 'external';
  parameters: Record<string, unknown>;
  resourceUnits: number;
  replay?: 'never' | 'safe';
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}

const PARAMETERS_SCHEMA_PROPERTIES: Record<string, unknown> = {
  demand: { type: 'number', minimum: 0, maximum: 5000, description: '日均基础需求量 (件)' },
  inventory: { type: 'number', minimum: 0, maximum: 100000, description: '期初现货库存 (件)' },
  capacity: { type: 'number', minimum: 0, maximum: 10000, description: '每日发货能力上限 (件)' },
  leadTime: { type: 'number', minimum: 1, maximum: 30, description: '常规采购到货提前期 (天)' },
  promo: { type: 'number', minimum: 0, maximum: 200, description: '活动增量百分比 (0-200%)' },
  demandShock: { type: 'boolean', description: '是否叠加需求冲击 (D8-D21 乘数 1.3)' },
  supplyShock: { type: 'boolean', description: '是否叠加供给延迟 (+3天到货延迟)' },
  price: { type: 'number', minimum: 0, maximum: 100000, description: '商品单价 (元)' },
  cost: { type: 'number', minimum: 0, maximum: 100000, description: '商品进价 (元)' },
  fulfillmentCost: { type: 'number', minimum: 0, maximum: 1000, description: '单件履约与运费 (元)' },
  holdingCost: { type: 'number', minimum: 0, maximum: 100, description: '单件日仓储费 (元/件/天)' },
  cash: { type: 'number', minimum: 0, maximum: 100000000, description: '期初可用现金 (元)' },
  extraStock: { type: 'number', minimum: 0, maximum: 100000, description: '提前现货备货采购量 (件)' },
  maxWait: { type: 'number', minimum: 0, maximum: 30, description: '订单等待上限 (天)' },
  cashThreshold: { type: 'number', minimum: 0, maximum: 100000000, description: '现金预警阈值 (元)' },
  backlogThreshold: { type: 'number', minimum: 0, maximum: 100000, description: '积压预警阈值 (单)' }
};

export function createSimulationTools(service: SimLabService): SimLabTool[] {
  // Compliant rejection envelope (Finding F-06)
  const reject = (
    code: string,
    message: string,
    issues: Array<{ path: string; expected: string; received: unknown }> = [],
    retry: 'after_correction' | 'query_only' | 'new_operation_allowed' | 'never' = 'after_correction',
    operationId = 'OP-REJECT'
  ) => ({
    operationId,
    status: 'rejected_not_executed',
    execution: 'not_started',
    code,
    message,
    issues,
    retry
  });

  const success = (data: unknown, operationId?: string) => ({
    status: 'succeeded',
    execution: 'settled',
    operationId: operationId || ('OP-' + Date.now().toString(36)),
    data
  });

  return [
    // 1. inspect_model
    {
      name: 'inspect_model',
      description: '查询仿真内核版本、SHA-256、参数口径定义、三方案支持规则与未建模能力。',
      effect: 'read',
      replay: 'safe',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          modelId: { type: 'string', description: '模型标识，如 simlab-daily-fifo-0.1.0' },
          version: { type: 'string', description: '可选版本' }
        },
        required: ['modelId'],
        additionalProperties: false
      },
      async execute(args) {
        const { modelId } = args as { modelId: string };
        if (modelId !== MODEL_VERSION && modelId !== 'simlab-daily-fifo-0.1.0') {
          return reject('UNSUPPORTED_MODEL', `未知或不受支持的模型: ${modelId}`, [
            { path: 'modelId', expected: MODEL_VERSION, received: modelId }
          ]);
        }
        return success({
          modelVersion: MODEL_VERSION,
          coreHash: CORE_SHA256,
          parameterSchema: PARAM_RULES,
          units: {
            currency: 'CNY',
            volume: 'pieces',
            ratio: 'ratio_0_1'
          },
          scenarios: SCENARIOS,
          unmodeledCapabilities: [
            '多仓调拨',
            '退货回仓',
            '随机分布蒙特卡洛',
            '账期融资'
          ],
          assumptions: '单仓离散事件日级确定性 FIFO 发货与固定采购结算'
        });
      }
    },

    // 2. read_draft
    {
      name: 'read_draft',
      description: '读取指定实验的当前工作稿配置、当前版本 revision、口径确认状态与最新运行摘要。',
      effect: 'read',
      replay: 'safe',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' }
        },
        required: ['experimentId'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const { experimentId } = args as { experimentId: string };
          const draft = await service.getExperiment(experimentId);
          return success({
            experimentId: draft.id,
            revision: draft.revision,
            goal: draft.goal,
            name: draft.name,
            parameters: draft.parameters,
            inputHash: draft.inputHash,
            confirmedRevision: draft.confirmedRevision,
            hasActiveProposal: draft.activeProposal !== null,
            latestRunId: draft.latestRun?.runId || null,
            latestRunStale: draft.latestRun?.isStale || false,
            snapshotsCount: draft.snapshots.length
          });
        } catch (err: unknown) {
          const e = err as Error;
          return reject('EXPERIMENT_NOT_FOUND', e.message, [
            { path: 'experimentId', expected: 'valid experiment id', received: (args as { experimentId?: unknown }).experimentId }
          ]);
        }
      }
    },

    // 3. propose_change
    {
      name: 'propose_change',
      description: '针对当前实验工作稿提交经营假设或参数变更提案（不直接修改工作稿，需明确采纳后生效）。',
      effect: 'write',
      replay: 'never',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' },
          expectedRevision: { type: 'integer', minimum: 0, description: '期望的工作稿基准版本' },
          patch: {
            type: 'object',
            properties: PARAMETERS_SCHEMA_PROPERTIES,
            additionalProperties: false,
            description: '待调整的参数子集'
          },
          rationale: { type: 'string', description: '业务背景与调整意图' },
          assumptions: {
            type: 'array',
            items: { type: 'string' },
            description: '提案所依赖的假设列表'
          }
        },
        required: ['experimentId', 'expectedRevision', 'patch'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const { experimentId, expectedRevision, patch, rationale } = args as {
            experimentId: string;
            expectedRevision: number;
            patch: Partial<SimLabParameters>;
            rationale?: string;
          };
          const draft = await service.getExperiment(experimentId);
          if (draft.revision !== expectedRevision) {
            return reject('CAS_CONFLICT', `版本冲突: 当前为 ${draft.revision}，期望 ${expectedRevision}`);
          }
          const proposal = await service.proposePatch(experimentId, patch);
          if (rationale) {
            proposal.target = rationale;
          }
          return success(proposal, proposal.id);
        } catch (err: unknown) {
          const e = err as Error;
          if (e.name === 'UnsupportedModelError') {
            return reject('UNSUPPORTED_MODEL', e.message);
          }
          return reject('PROPOSE_FAILED', e.message);
        }
      }
    },

    // 4. preview_change
    {
      name: 'preview_change',
      description: '对指定提案调用确定性内核进行仿真前瞻预览，计算三方案 delta 与政策联动。',
      effect: 'read',
      replay: 'safe',
      resourceUnits: 2,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' },
          proposalId: { type: 'string', description: '待预览的提案 ID' },
          baseRevision: { type: 'integer', minimum: 0, description: '提案基准版本号' },
          modelVersion: { type: 'string', description: '模型版本' }
        },
        required: ['experimentId', 'proposalId', 'baseRevision'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const { experimentId, proposalId, baseRevision } = args as {
            experimentId: string;
            proposalId: string;
            baseRevision: number;
          };
          const draft = await service.getExperiment(experimentId);
          if (!draft.activeProposal || draft.activeProposal.id !== proposalId) {
            return reject('PROPOSAL_NOT_FOUND', `提案 ${proposalId} 未在实验中激活`);
          }
          if (draft.revision !== baseRevision) {
            return reject('STALE_PROPOSAL', `提案已过期: 提案基于 r${baseRevision}，当前工作稿已变更为 r${draft.revision}`);
          }

          const beforeRun = buildRun(draft.parameters);
          const candidateParams = {
            ...draft.parameters,
            ...draft.activeProposal.patch,
            days: 30 as const
          };
          const afterRun = buildRun(candidateParams);

          return success({
            proposalId,
            baseRevision,
            beforeInputHash: draft.inputHash,
            afterInputHash: computeInputHash(candidateParams),
            delta: {
              baseline: {
                cash: afterRun.results.baseline.summary.minCash - beforeRun.results.baseline.summary.minCash,
                contribution: afterRun.results.baseline.summary.contribution - beforeRun.results.baseline.summary.contribution,
                fulfillmentRate: afterRun.results.baseline.summary.fulfillmentRate
              },
              advance: {
                cash: afterRun.results.advance.summary.minCash - beforeRun.results.advance.summary.minCash,
                contribution: afterRun.results.advance.summary.contribution - beforeRun.results.advance.summary.contribution
              },
              split: {
                cash: afterRun.results.split.summary.minCash - beforeRun.results.split.summary.minCash,
                contribution: afterRun.results.split.summary.contribution - beforeRun.results.split.summary.contribution
              }
            },
            policyCouplings: [
              'split.acceptanceCap follows capacity (分批接单上限跟随每日发货能力)'
            ],
            requires: ['explicit_adoption', 'caliber_review', 'rerun']
          });
        } catch (err: unknown) {
          const e = err as Error;
          return reject('PREVIEW_FAILED', e.message);
        }
      }
    },

    // 5. apply_proposal
    {
      name: 'apply_proposal',
      description: '采纳参数提案到当前实验工作稿（严格要求宿主 UI 采纳凭据 hostAcceptanceRef，拒绝 Agent 自行采纳）。',
      effect: 'write',
      replay: 'never',
      resourceUnits: 2,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' },
          proposalId: { type: 'string', description: '提案 ID' },
          expectedRevision: { type: 'integer', minimum: 0, description: '期望版本' },
          hostAcceptanceRef: { type: 'string', description: '宿主 UI 采纳凭据引用 (如 HOST-ACCEPT-001)' },
          acceptedPreviewHash: { type: 'string', description: '可选预览哈希' }
        },
        required: ['experimentId', 'proposalId', 'expectedRevision', 'hostAcceptanceRef'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const { experimentId, proposalId, expectedRevision, hostAcceptanceRef, acceptedPreviewHash } = args as {
            experimentId: string;
            proposalId: string;
            expectedRevision: number;
            hostAcceptanceRef: string;
            acceptedPreviewHash?: string;
          };
          if (!hostAcceptanceRef || !hostAcceptanceRef.trim()) {
            return reject('AUTHORITY_REQUIRED', '需要宿主采纳凭据 hostAcceptanceRef，Agent 不能自行代表用户采纳提案', [
              { path: 'hostAcceptanceRef', expected: 'non-empty string', received: hostAcceptanceRef }
            ]);
          }

          const draft = await service.adoptProposal(experimentId, proposalId, expectedRevision, hostAcceptanceRef, acceptedPreviewHash);
          return success({
            experimentId: draft.id,
            newRevision: draft.revision,
            confirmationInvalidated: true,
            parameters: draft.parameters,
            inputHash: draft.inputHash,
            affectedRuns: draft.latestRun ? [draft.latestRun.runId] : []
          });
        } catch (err: unknown) {
          const e = err as Error;
          if (e.name === 'AuthorityRequiredError') {
            return reject('AUTHORITY_REQUIRED', e.message);
          }
          if (e.name === 'CASConflictError') {
            return reject('CAS_CONFLICT', e.message);
          }
          if (e.name === 'StaleProposalError') {
            return reject('STALE_PROPOSAL', e.message);
          }
          return reject('APPLY_FAILED', e.message);
        }
      }
    },

    // 6. confirm_caliber
    {
      name: 'confirm_caliber',
      description: '对指定版本的工作稿进行口径确认（严格要求宿主确认凭据 hostReviewRef，Agent 无凭据时拒绝）。',
      effect: 'write',
      replay: 'never',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' },
          expectedRevision: { type: 'integer', minimum: 0, description: '期望确认的版本' },
          hostReviewRef: { type: 'string', description: '宿主口径确认凭据 (如 HOST-REVIEW-001)' },
          scopeHash: { type: 'string', description: '可选口径范围哈希' }
        },
        required: ['experimentId', 'expectedRevision', 'hostReviewRef'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const { experimentId, expectedRevision, hostReviewRef, scopeHash } = args as {
            experimentId: string;
            expectedRevision: number;
            hostReviewRef: string;
            scopeHash?: string;
          };
          if (!hostReviewRef || !hostReviewRef.trim()) {
            return reject('AUTHORITY_REQUIRED', '需要宿主确认凭据 hostReviewRef，Agent 不能自行确认计算口径', [
              { path: 'hostReviewRef', expected: 'non-empty string', received: hostReviewRef }
            ]);
          }

          const draft = await service.confirmCaliber(experimentId, expectedRevision, hostReviewRef, scopeHash);
          return success({
            experimentId: draft.id,
            confirmedRevision: draft.confirmedRevision,
            hostReviewRef: draft.hostCredentials.hostReviewRef
          });
        } catch (err: unknown) {
          const e = err as Error;
          if (e.name === 'AuthorityRequiredError') {
            return reject('AUTHORITY_REQUIRED', e.message);
          }
          if (e.name === 'CASConflictError') {
            return reject('CAS_CONFLICT', e.message);
          }
          return reject('CONFIRM_FAILED', e.message);
        }
      }
    },

    // 7. run_experiment
    {
      name: 'run_experiment',
      description: '在服务端从指定 revision 读取参数执行确定性 FIFO 内核仿真，校验口径确认、inputHash 与幂等键。',
      effect: 'write',
      replay: 'never',
      resourceUnits: 5,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' },
          expectedRevision: { type: 'integer', minimum: 0, description: '期望版本' },
          modelVersion: { type: 'string', description: '模型版本，必须匹配内核版本' },
          inputHash: { type: 'string', description: '规范化输入参数哈希 (sha256:...)' },
          idempotencyKey: { type: 'string', description: '客户端幂等键 (同一键同输入返回原回执)' },
          requestedEvidence: {
            type: 'array',
            items: { type: 'string', enum: ['dailyLedger', 'thresholds', 'sensitivity', 'conservation'] },
            description: '请求返回的证据集'
          }
        },
        required: ['experimentId', 'expectedRevision', 'modelVersion', 'inputHash', 'idempotencyKey'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const {
            experimentId,
            expectedRevision,
            modelVersion,
            inputHash,
            idempotencyKey,
            requestedEvidence
          } = args as {
            experimentId: string;
            expectedRevision: number;
            modelVersion: string;
            inputHash: string;
            idempotencyKey: string;
            requestedEvidence?: string[];
          };

          if (modelVersion !== MODEL_VERSION && modelVersion !== 'simlab-daily-fifo-0.1.0') {
            return reject('UNSUPPORTED_MODEL', `模型版本不匹配: ${modelVersion}`, [
              { path: 'modelVersion', expected: MODEL_VERSION, received: modelVersion }
            ]);
          }

          const res = await service.runSimulation(experimentId, expectedRevision, {
            idempotencyKey,
            inputHash,
            modelVersion,
            requestedEvidence
          });

          return success({
            operationId: res.receipt.operationId,
            runId: res.run?.runId,
            stage: res.receipt.stage,
            revision: res.receipt.revision,
            modelVersion,
            inputHash,
            validationPassed: res.run?.payload.validationPassed,
            summary: res.run?.payload.results.baseline.summary
          }, res.receipt.operationId);
        } catch (err: unknown) {
          const e = err as Error;
          if (e.name === 'CaliberNotConfirmedError') {
            return reject('CALIBER_NOT_CONFIRMED', e.message);
          }
          if (e.name === 'InputHashMismatchError') {
            return reject('INPUT_HASH_MISMATCH', e.message);
          }
          if (e.name === 'IdempotencyConflictError') {
            return reject('IDEMPOTENCY_CONFLICT', e.message);
          }
          if (e.name === 'CASConflictError') {
            return reject('CAS_CONFLICT', e.message);
          }
          if (e.name === 'UnknownOperationPendingError') {
            return reject('UNKNOWN_OPERATION_PENDING', e.message, [], 'query_only');
          }
          return reject('RUN_FAILED', e.message);
        }
      }
    },

    // 8. get_operation
    {
      name: 'get_operation',
      description: '查询操作回执的状态、准入、执行情况与恢复结果。',
      effect: 'read',
      replay: 'safe',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          operationId: { type: 'string', description: '待查询的操作回执 ID' }
        },
        required: ['operationId'],
        additionalProperties: false
      },
      async execute(args) {
        const { operationId } = args as { operationId: string };
        const receipt = await service.getOperation(operationId);
        if (!receipt) {
          return reject('NOT_FOUND', `未找到操作回执 ${operationId}`, [
            { path: 'operationId', expected: 'existing operationId', received: operationId }
          ], 'query_only');
        }
        return success(receipt, operationId);
      }
    },

    // 9. get_run
    {
      name: 'get_run',
      description: '读取仿真运行记录的冻结输入参数、三方案结果、验证状态与是否历史标识。',
      effect: 'read',
      replay: 'safe',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: '仿真运行 ID' }
        },
        required: ['runId'],
        additionalProperties: false
      },
      async execute(args) {
        const { runId } = args as { runId: string };
        const runInfo = await service.getRun(runId);
        if (!runInfo) {
          return reject('NOT_FOUND', `未找到运行记录: ${runId}`, [
            { path: 'runId', expected: 'existing runId', received: runId }
          ]);
        }
        return success({
          runId: runInfo.run.runId,
          revision: runInfo.run.revision,
          inputHash: runInfo.run.inputHash,
          modelVersion: runInfo.run.modelVersion,
          isHistorical: runInfo.historical,
          validationPassed: runInfo.run.payload.validationPassed,
          resultsSummary: {
            baseline: runInfo.run.payload.results.baseline.summary,
            advance: runInfo.run.payload.results.advance.summary,
            split: runInfo.run.payload.results.split.summary
          }
        });
      }
    },

    // 10. read_evidence
    {
      name: 'read_evidence',
      description: '读取指定运行与情景的真实计算证据（日账明细、预警阈值、敏感性矩阵或守恒残差），不补数。',
      effect: 'read',
      replay: 'safe',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: '运行 ID' },
          scenarioId: { type: 'string', enum: ['baseline', 'advance', 'split'], description: '情景 ID' },
          kind: {
            type: 'string',
            enum: ['summary', 'day', 'ledger', 'thresholds', 'sensitivity', 'conservation'],
            description: '证据类型'
          },
          day: { type: 'integer', minimum: 0, maximum: 30, description: '指定日序 (0..30)' }
        },
        required: ['runId', 'scenarioId', 'kind'],
        additionalProperties: false
      },
      async execute(args) {
        const { runId, scenarioId, kind, day } = args as {
          runId: string;
          scenarioId: 'baseline' | 'advance' | 'split';
          kind: 'summary' | 'day' | 'ledger' | 'thresholds' | 'sensitivity' | 'conservation';
          day?: number;
        };
        const evidence = await service.readEvidence(runId, scenarioId, kind, day);
        if (!evidence) {
          return reject('NOT_FOUND', `未找到对应证据: ${runId}/${scenarioId}/${kind}`);
        }
        return success(evidence);
      }
    },

    // 11. cancel_operation
    {
      name: 'cancel_operation',
      description: '对正在进行或已准入的操作发送取消信号，记录终止凭据。',
      effect: 'write',
      replay: 'never',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' },
          operationId: { type: 'string', description: '操作 ID' },
          hostStopRef: { type: 'string', description: '可选宿主停止凭据' }
        },
        required: ['experimentId', 'operationId'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const { experimentId, operationId, hostStopRef } = args as {
            experimentId: string;
            operationId: string;
            hostStopRef?: string;
          };
          const receipt = await service.cancelSimulation(experimentId, operationId, hostStopRef);
          return success(receipt, operationId);
        } catch (err: unknown) {
          const e = err as Error;
          return reject('CANCEL_FAILED', e.message);
        }
      }
    },

    // 12. save_snapshot
    {
      name: 'save_snapshot',
      description: '固化当前实验运行结果为不可变快照（上限 10 份，同运行去重，需宿主冻结凭据 hostFreezeRef）。',
      effect: 'write',
      replay: 'never',
      resourceUnits: 2,
      parameters: {
        type: 'object',
        properties: {
          experimentId: { type: 'string', description: '实验 ID' },
          runId: { type: 'string', description: '运行 ID' },
          expectedRevision: { type: 'integer', minimum: 0, description: '期望版本' },
          confirmedRevision: { type: 'integer', minimum: 0, description: '已确认版本' },
          hostFreezeRef: { type: 'string', description: '宿主冻结凭据 (如 HOST-FREEZE-001)' }
        },
        required: ['experimentId', 'runId', 'expectedRevision', 'confirmedRevision', 'hostFreezeRef'],
        additionalProperties: false
      },
      async execute(args) {
        try {
          const { experimentId, hostFreezeRef, expectedRevision } = args as {
            experimentId: string;
            runId: string;
            expectedRevision: number;
            confirmedRevision: number;
            hostFreezeRef: string;
          };
          if (!hostFreezeRef || !hostFreezeRef.trim()) {
            return reject('AUTHORITY_REQUIRED', '需要宿主冻结凭据 hostFreezeRef', [
              { path: 'hostFreezeRef', expected: 'non-empty string', received: hostFreezeRef }
            ]);
          }

          const snapshot = await service.freezeSnapshot(experimentId, hostFreezeRef, expectedRevision);
          return success(snapshot, snapshot.id);
        } catch (err: unknown) {
          const e = err as Error;
          if (e.name === 'AuthorityRequiredError') {
            return reject('AUTHORITY_REQUIRED', e.message);
          }
          if (e.name === 'CASConflictError') {
            return reject('CAS_CONFLICT', e.message);
          }
          return reject('SNAPSHOT_FAILED', e.message);
        }
      }
    },

    // 13. export_snapshot
    {
      name: 'export_snapshot',
      description: '导出不可变快照或当前运行结果的完整 JSON 审计数据。',
      effect: 'read',
      replay: 'safe',
      resourceUnits: 1,
      parameters: {
        type: 'object',
        properties: {
          snapshotId: { type: 'string', description: '快照 ID (或运行 ID)' },
          format: { type: 'string', enum: ['json'], description: '导出格式' }
        },
        required: ['snapshotId'],
        additionalProperties: false
      },
      async execute(args) {
        const { snapshotId } = args as { snapshotId: string; format?: string };
        const snap = await service.getSnapshot(snapshotId);
        if (snap) {
          return success({
            snapshotId: snap.id,
            experimentId: snap.experimentId,
            runId: snap.runId,
            revision: snap.revision,
            inputHash: snap.inputHash,
            modelVersion: snap.modelVersion,
            parameters: snap.parameters,
            summary: snap.summary,
            historical: true,
            createdAt: snap.createdAt
          });
        }

        const runInfo = await service.getRun(snapshotId);
        if (runInfo) {
          return success({
            runId: runInfo.run.runId,
            experimentId: runInfo.experimentId,
            revision: runInfo.run.revision,
            inputHash: runInfo.run.inputHash,
            modelVersion: runInfo.run.modelVersion,
            payload: runInfo.run.payload,
            historical: runInfo.historical,
            createdAt: runInfo.run.createdAt
          });
        }

        return reject('NOT_FOUND', `未找到快照或运行记录: ${snapshotId}`);
      }
    }
  ];
}
