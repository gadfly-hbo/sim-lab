import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SimLabService } from '../src/service/index.js';
import { ExperimentStore } from '../src/store/index.js';
import { createSimulationTools } from '../src/tools/index.js';
import {
  PersistentBudgetStore,
  PersistentJsonlAuditSink,
  SimLabSessionStorage,
  SessionBusyError,
  createOfflineScriptedTransport,
  createSimLabRuntimeContext,
  createSimLabAuthorizer
} from '../src/pi/index.js';

describe('Seam S3: 13 Tool Contracts & Pi Agent Adapter', () => {
  let tmpDir: string;
  let store: ExperimentStore;
  let service: SimLabService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simlab-pi-test-'));
    store = new ExperimentStore(tmpDir);
    service = new SimLabService(store);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('declares 13 tools with strict additionalProperties: false on parameters', () => {
    const tools = createSimulationTools(service);
    expect(tools).toHaveLength(13);

    const expectedNames = [
      'inspect_model',
      'read_draft',
      'propose_change',
      'preview_change',
      'apply_proposal',
      'confirm_caliber',
      'run_experiment',
      'get_operation',
      'get_run',
      'read_evidence',
      'cancel_operation',
      'save_snapshot',
      'export_snapshot'
    ];
    expect(tools.map(t => t.name)).toEqual(expectedNames);

    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.additionalProperties).toBe(false);
    }
  });

  it('returns structured rejected_not_executed envelope on invalid inputs without throwing', async () => {
    const tools = createSimulationTools(service);

    // 1. inspect_model with unknown model
    const inspectTool = tools.find(t => t.name === 'inspect_model')!;
    const res1 = await inspectTool.execute({ modelId: 'unknown-model-xyz' }) as {
      status: string;
      execution: string;
      code: string;
      issues: unknown[];
      retry: string;
    };
    expect(res1.status).toBe('rejected_not_executed');
    expect(res1.execution).toBe('not_started');
    expect(res1.code).toBe('UNSUPPORTED_MODEL');
    expect(res1.issues.length).toBeGreaterThan(0);
    expect(res1.retry).toBe('after_correction');

    // 2. confirm_caliber without hostReviewRef
    const confirmTool = tools.find(t => t.name === 'confirm_caliber')!;
    const res2 = await confirmTool.execute({ experimentId: 'EXP-1', expectedRevision: 1 }) as {
      status: string;
      execution: string;
      code: string;
    };
    expect(res2.status).toBe('rejected_not_executed');
    expect(res2.execution).toBe('not_started');
    expect(res2.code).toBe('AUTHORITY_REQUIRED');

    // 3. apply_proposal without hostAcceptanceRef
    const applyTool = tools.find(t => t.name === 'apply_proposal')!;
    const res3 = await applyTool.execute({ experimentId: 'EXP-1', proposalId: 'P-1', expectedRevision: 1 }) as {
      status: string;
      code: string;
    };
    expect(res3.status).toBe('rejected_not_executed');
    expect(res3.code).toBe('AUTHORITY_REQUIRED');
  });

  it('verifies static architecture boundary: pi-agent-runtime is imported ONLY in src/pi/', () => {
    const srcDir = path.resolve(__dirname, '../src');

    function scanFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          files.push(...scanFiles(full));
        } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.js'))) {
          files.push(full);
        }
      }
      return files;
    }

    const allFiles = scanFiles(srcDir);
    const violations: string[] = [];

    for (const file of allFiles) {
      const rel = path.relative(srcDir, file);
      // Skip files inside src/pi/
      if (rel.startsWith('pi/') || rel.startsWith('pi\\')) {
        continue;
      }
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('from \'pi-agent-runtime\'') || content.includes('from "pi-agent-runtime"') || content.includes('require(\'pi-agent-runtime\')') || content.includes('require("pi-agent-runtime")')) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('persists budget usage across instances without resetting', async () => {
    const budget1 = new PersistentBudgetStore(tmpDir, 5000);
    const lease1 = await budget1.claim('t1', 'r1', 'cfg', {
      modelCalls: 10,
      toolCalls: 10,
      outputTokens: 5000,
      wallTimeMs: 1000
    });
    await lease1.settleModel(100, 150);
    await lease1.reserveTool(2);
    await lease1.release(50);

    expect(budget1.getUsage().outputTokens).toBe(150);
    expect(budget1.getUsage().toolCalls).toBe(1);

    // Reopen with new instance in same dir
    const budget2 = new PersistentBudgetStore(tmpDir, 5000);
    expect(budget2.getUsage().outputTokens).toBe(150);
    expect(budget2.getUsage().toolCalls).toBe(1);
  });

  it('records structured JSONL audit events', async () => {
    const audit = new PersistentJsonlAuditSink(tmpDir);
    const abortCtrl = new AbortController();

    await audit.append({
      version: '1.0',
      taskId: 'task_001',
      runId: 'run_001',
      sequence: 1,
      kind: 'run.started',
      at: new Date().toISOString(),
      provider: 'simlab-offline',
      model: 'simlab-scripted-0.1',
      contextVersions: {}
    }, abortCtrl.signal);

    const events = audit.readEvents();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('run.started');
  });

  it('enforces exclusive writer lock in SessionStorage', async () => {
    const storage = new SimLabSessionStorage(tmpDir);
    const abortCtrl = new AbortController();

    const lock = await storage.acquireWriter(abortCtrl.signal);
    expect(lock).toBeDefined();

    // Concurrent acquisition fails
    await expect(storage.acquireWriter(abortCtrl.signal)).rejects.toThrow(SessionBusyError);

    // Release allows subsequent acquisition
    await lock.release();
    const lock2 = await storage.acquireWriter(abortCtrl.signal);
    await lock2.release();
  });

  it('drives multi-turn session offline and safely maps reconcile unknown status', async () => {
    const tools = createSimulationTools(service);
    const ctx = createSimLabRuntimeContext({
      storageDir: tmpDir,
      tools
    });

    // Create real experiment
    const exp = await service.createExperiment('离线会话测试');
    expect(exp.id).toBeDefined();

    // 1. Normal query session
    const res1 = await ctx.runSafeAgentSession('sess_1', '查询模型');
    expect(res1.status).toBe('succeeded');

    // 2. Reconcile unknown mapping test
    const res2 = await ctx.runSafeAgentSession('sess_2', '查询模型', 'unknown');
    expect(res2.status).toBe('unknown');
    expect(res2.error).toMatchObject({
      code: 'STATE_UNKNOWN',
      retry: 'query_only'
    });
  });

  it('enforces host credential verification in Pi runtime authorizer', async () => {
    const authorizer = createSimLabAuthorizer();
    const abortCtrl = new AbortController();

    // 1. Tool call without host credential is rejected
    const unauthApply = await authorizer({
      kind: 'tool',
      name: 'apply_proposal',
      effect: 'write',
      arguments: { experimentId: 'EXP-1', proposalId: 'P-1', expectedRevision: 1 }
    }, abortCtrl.signal);
    expect(unauthApply).toBe(false);

    // 2. Tool call with host credential is authorized
    const authApply = await authorizer({
      kind: 'tool',
      name: 'apply_proposal',
      effect: 'write',
      arguments: { experimentId: 'EXP-1', proposalId: 'P-1', expectedRevision: 1, hostAcceptanceRef: 'HOST-ACCEPT-001' }
    }, abortCtrl.signal);
    expect(authApply).toBe(true);

    // 3. Confirm caliber without host credential is rejected
    const unauthConfirm = await authorizer({
      kind: 'tool',
      name: 'confirm_caliber',
      effect: 'write',
      arguments: { experimentId: 'EXP-1', expectedRevision: 1 }
    }, abortCtrl.signal);
    expect(unauthConfirm).toBe(false);

    // 4. Confirm caliber with host credential is authorized
    const authConfirm = await authorizer({
      kind: 'tool',
      name: 'confirm_caliber',
      effect: 'write',
      arguments: { experimentId: 'EXP-1', expectedRevision: 1, hostReviewRef: 'HOST-REVIEW-001' }
    }, abortCtrl.signal);
    expect(authConfirm).toBe(true);
  });
});
