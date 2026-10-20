import type { SimLabParameters, SimLabRun, ScenarioSummary } from '../kernel/types.js';

export interface HostCredentials {
  hostAcceptanceRef?: string | null;
  hostReviewRef?: string | null;
  hostFreezeRef?: string | null;
  hostStopRef?: string | null;
}

export interface ProposalDiffItem {
  before: unknown;
  after: unknown;
}

export interface ProposalImpact {
  cash: number;
  contribution: number;
  fulfillmentRate: number | null;
}

export interface Proposal {
  id: string;
  baseRevision: number;
  target: string;
  patch: Partial<SimLabParameters>;
  diff: Record<string, ProposalDiffItem>;
  impact: ProposalImpact;
  explanation: string;
  createdAt: string;
}

export interface StampedRun {
  runId: string;
  revision: number;
  inputHash: string;
  modelVersion: string;
  isStale: boolean;
  operationId: string;
  payload: SimLabRun;
  createdAt: string;
}

export interface ExperimentSnapshot {
  id: string;
  experimentId: string;
  runId: string;
  revision: number;
  inputHash: string;
  modelVersion: string;
  parameters: SimLabParameters;
  confirmedRevision: number;
  hostFreezeRef?: string;
  summary: ScenarioSummary;
  createdAt: string;
}

export type OperationStage = 'admitted' | 'calc' | 'settled' | 'unknown' | 'cancelled' | 'failed';

export interface OperationReceipt {
  operationId: string;
  experimentId: string;
  type: 'run' | 'cancel' | 'adopt' | 'snapshot' | 'reconcile';
  revision: number;
  stage: OperationStage;
  executionStarted: boolean;
  reconciled: boolean;
  idempotencyKey?: string;
  inputHash?: string;
  runId?: string;
  snapshotId?: string;
  error?: {
    code: string;
    message: string;
    retry?: 'after_correction' | 'new_operation_allowed' | 'query_only' | 'never';
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentDraft {
  id: string;
  name: string;
  goal: string;
  revision: number;
  parameters: SimLabParameters;
  inputHash: string;
  confirmedRevision: number | null;
  hostCredentials: HostCredentials;
  activeProposal: Proposal | null;
  latestRun: StampedRun | null;
  snapshots: ExperimentSnapshot[];
  receipts: Record<string, OperationReceipt>;
  runSequence: number;
  createdAt: string;
  updatedAt: string;
}
