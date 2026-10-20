import {
  MODEL_VERSION,
  CORE_SHA256,
  type SimLabParameters
} from '../kernel/index.js';
import { SimLabService } from '../service/index.js';
import type {
  ExperimentDraft,
  ExperimentSnapshot,
  StampedRun
} from '../store/index.js';

export interface JuanerAiInvocationContext {
  modelVersion: string;
  coreSha256: string;
  experimentId: string;
  revision: number;
  inputHash: string;
  runId?: string;
  operationId?: string;
  snapshotId?: string;
}

export interface JuanerAiMetricContract {
  metricName: string;
  scenario: 'baseline' | 'advance' | 'split';
  value: number;
  unit: string;
  valid: boolean;
}

export class JuanerAiPluginSeam {
  private service: SimLabService;

  constructor(service?: SimLabService) {
    this.service = service || new SimLabService();
  }

  public getModelVersion(): string {
    return MODEL_VERSION;
  }

  public getCoreSha256(): string {
    return CORE_SHA256;
  }

  public async getContext(experimentId: string): Promise<JuanerAiInvocationContext> {
    const draft = await this.service.getExperiment(experimentId);
    return {
      modelVersion: MODEL_VERSION,
      coreSha256: CORE_SHA256,
      experimentId: draft.id,
      revision: draft.revision,
      inputHash: draft.inputHash,
      runId: draft.latestRun?.runId,
      operationId: draft.latestRun?.operationId,
      snapshotId: draft.snapshots[draft.snapshots.length - 1]?.id
    };
  }

  public async exportMetricsForHost(experimentId: string): Promise<JuanerAiMetricContract[]> {
    const draft = await this.service.getExperiment(experimentId);
    if (!draft.latestRun || draft.latestRun.isStale) {
      throw new Error('No valid settled run available for host metric extraction');
    }

    const metrics: JuanerAiMetricContract[] = [];
    const scenarios: Array<'baseline' | 'advance' | 'split'> = ['baseline', 'advance', 'split'];

    for (const sc of scenarios) {
      const summary = draft.latestRun.payload.results[sc].summary;
      metrics.push({
        metricName: 'contribution_profit',
        scenario: sc,
        value: summary.contribution,
        unit: 'CNY',
        valid: summary.valid
      });
      metrics.push({
        metricName: 'min_cash',
        scenario: sc,
        value: summary.minCash,
        unit: 'CNY',
        valid: summary.valid
      });
      metrics.push({
        metricName: 'closing_inventory',
        scenario: sc,
        value: summary.closingInventory,
        unit: 'pieces',
        valid: summary.valid
      });
      if (summary.fulfillmentRate !== null) {
        metrics.push({
          metricName: 'fulfillment_rate',
          scenario: sc,
          value: summary.fulfillmentRate,
          unit: 'ratio',
          valid: summary.valid
        });
      }
    }

    return metrics;
  }
}
