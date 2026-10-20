import {
  createRuntime,
  createSessionRuntime,
  type Tool,
  type Runtime,
  type SessionRuntime,
  type ModelConfig,
  type ModelTransport,
  type JsonObject,
  type JsonValue
} from 'pi-agent-runtime';
import type { SimLabTool } from '../tools/simulation-tools.js';
import { PersistentJsonlAuditSink } from './audit-sink.js';
import { PersistentBudgetStore } from './budget-store.js';
import { SimLabSessionStorage } from './session-storage.js';
import { createOfflineScriptedTransport } from './offline-transport.js';

export const OFFLINE_MODEL_CONFIG: ModelConfig = {
  provider: 'simlab-offline',
  id: 'simlab-scripted-0.1',
  protocol: 'openai-completions',
  endpoint: 'http://localhost:0',
  contextWindow: 32768,
  maxOutputTokens: 2048,
  reasoning: false
};

export function adaptSimLabToolsToPi(tools: SimLabTool[]): Tool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    effect: t.effect,
    parameters: t.parameters as JsonObject,
    resourceUnits: t.resourceUnits,
    replay: t.replay || 'safe',
    policyVersion: '1.0',
    async execute(args: JsonObject, signal: AbortSignal): Promise<JsonValue> {
      try {
        const result = await t.execute(args as Record<string, unknown>, signal);
        return JSON.parse(JSON.stringify(result)) as JsonValue;
      } catch (err: unknown) {
        const e = err as Error;
        return {
          status: 'rejected_not_executed',
          error: {
            code: 'TOOL_EXECUTION_ERROR',
            message: e.message,
            retry: 'after_correction'
          }
        } as JsonValue;
      }
    }
  }));
}

export interface SimLabRuntimeOptions {
  storageDir?: string;
  transport?: ModelTransport;
  audit?: PersistentJsonlAuditSink;
  budgets?: PersistentBudgetStore;
  storage?: SimLabSessionStorage;
  tools?: SimLabTool[];
  onReconcileUnknown?: (operationId: string) => void;
}

export interface SimLabRuntimeContext {
  runtime: Runtime;
  sessionRuntime: SessionRuntime;
  audit: PersistentJsonlAuditSink;
  budgets: PersistentBudgetStore;
  storage: SimLabSessionStorage;
  tools: Tool[];
  runSafeAgentSession: (
    sessionId: string,
    prompt: string,
    reconcileStatus?: 'ready' | 'unknown' | 'denied'
  ) => Promise<{ status: 'succeeded' | 'unknown' | 'failed'; result?: unknown; error?: unknown }>;
}

export const createSimLabAuthorizer = () => {
  return async (action: any, signal: AbortSignal): Promise<boolean> => {
    if (signal?.aborted) return false;

    if (action.kind === 'tool') {
      const toolName = action.name;
      const args = action.arguments || {};

      // Host credentials validation
      if (toolName === 'apply_proposal' || toolName === 'adopt_proposal') {
        if (!args.hostAcceptanceRef || typeof args.hostAcceptanceRef !== 'string' || !args.hostAcceptanceRef.trim()) {
          return false;
        }
      }

      if (toolName === 'confirm_caliber' || toolName === 'confirm_experiment_caliber') {
        if (!args.hostReviewRef || typeof args.hostReviewRef !== 'string' || !args.hostReviewRef.trim()) {
          return false;
        }
      }

      if (toolName === 'save_snapshot' || toolName === 'freeze_experiment_snapshot') {
        if (!args.hostFreezeRef || typeof args.hostFreezeRef !== 'string' || !args.hostFreezeRef.trim()) {
          return false;
        }
      }

      if (action.effect === 'write') {
        if (args.expectedRevision !== undefined && (typeof args.expectedRevision !== 'number' || args.expectedRevision < 0)) {
          return false;
        }
      }
    }

    return true;
  };
};

export function createSimLabRuntimeContext(options: SimLabRuntimeOptions = {}): SimLabRuntimeContext {
  const audit = options.audit || new PersistentJsonlAuditSink(options.storageDir);
  const budgets = options.budgets || new PersistentBudgetStore(options.storageDir);
  const storage = options.storage || new SimLabSessionStorage(options.storageDir);
  const transport = options.transport || createOfflineScriptedTransport();
  const tools = adaptSimLabToolsToPi(options.tools || []);
  const authorizer = createSimLabAuthorizer();

  const runtime = createRuntime({
    model: OFFLINE_MODEL_CONFIG,
    transport,
    audit,
    budgets,
    authorize: authorizer
  });

  let currentReconcileStatus: 'ready' | 'unknown' | 'denied' = 'ready';

  const sessionRuntime = createSessionRuntime({
    model: OFFLINE_MODEL_CONFIG,
    transport,
    audit,
    budgets,
    storage,
    authorize: authorizer,
    async bindOperation() {
      // Idempotent operation binding
    },
    async reconcile(input) {
      if (currentReconcileStatus === 'unknown') {
        if (input.open.length > 0 && options.onReconcileUnknown) {
          options.onReconcileUnknown(input.open[0].operationId);
        }
        return 'unknown';
      }
      return currentReconcileStatus;
    }
  });

  return {
    runtime,
    sessionRuntime,
    audit,
    budgets,
    storage,
    tools,
    async runSafeAgentSession(sessionId: string, prompt: string, reconcileStatus = 'ready') {
      currentReconcileStatus = reconcileStatus;
      try {
        let targetSessionId = sessionId;
        try {
          const list = await sessionRuntime.list();
          if (!list.some(s => s.id === sessionId)) {
            const created = await sessionRuntime.create();
            targetSessionId = created.id;
          }
        } catch {
          // If list/create fails, try direct
        }

        const res = await sessionRuntime.run({
          taskId: 'task_' + sessionId,
          sessionId: targetSessionId,
          prompt,
          tools,
          limits: {
            modelCalls: 10,
            toolCalls: 10,
            outputTokens: 8192,
            wallTimeMs: 30000
          }
        });

        if (res.status === 'failed') {
          if (res.reason === 'STATE_FAILED' || currentReconcileStatus === 'unknown') {
            return {
              status: 'unknown',
              error: {
                code: 'STATE_UNKNOWN',
                message: 'Session operation outcome unknown. Reconcile query required. Blind retry blocked.',
                retry: 'query_only'
              }
            };
          }
          return {
            status: 'failed',
            error: res.reason
          };
        }

        return { status: 'succeeded', result: res };
      } catch (err: unknown) {
        const e = err as Error;
        if (currentReconcileStatus === 'unknown' || e.message?.includes('STATE_FAILED') || e.message?.includes('unknown')) {
          return {
            status: 'unknown',
            error: {
              code: 'STATE_UNKNOWN',
              message: 'Session operation outcome unknown. Reconcile query required. Blind retry blocked.',
              retry: 'query_only'
            }
          };
        }
        return {
          status: 'failed',
          error: e.message
        };
      }
    }
  };
}
