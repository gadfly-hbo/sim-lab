import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHttpServer, type ServerInstance } from '../src/ui/server.js';
import { SimLabService } from '../src/service/index.js';
import { ExperimentStore } from '../src/store/index.js';
import { JuanerAiPluginSeam } from '../src/plugin/index.js';

describe('Seam S4: Local HTTP Server & JuanerAI Plugin Seam', () => {
  let tmpDir: string;
  let service: SimLabService;
  let serverInstance: ServerInstance;
  let baseUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simlab-http-test-'));
    const store = new ExperimentStore(tmpDir);
    service = new SimLabService(store);

    const { start } = createHttpServer({
      port: 4321,
      host: '127.0.0.1',
      service,
      staticDir: process.cwd()
    });

    serverInstance = await start();
    baseUrl = serverInstance.url;
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('serves static files: index.html, style.css, app.js, simulation-core.js', async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');
    const htmlText = await htmlRes.text();
    expect(htmlText).toContain('SimLab');

    const cssRes = await fetch(`${baseUrl}/style.css`);
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get('content-type')).toContain('text/css');

    const jsRes = await fetch(`${baseUrl}/app.js`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('content-type')).toContain('application/javascript');
  });

  it('responds to GET /api/v1/health with model version and core SHA256', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.modelVersion).toBe('simlab-daily-fifo-0.1.0');
    expect(body.coreSha256).toBe('8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca');
  });

  it('handles full experiment lifecycle via REST API', async () => {
    // 1. Create experiment
    const createRes = await fetch(`${baseUrl}/api/v1/experiments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: '大促备货方案分析',
        name: 'HTTP 测试实验',
        initialParams: { demand: 180, capacity: 250 }
      })
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const expId = created.data.id;
    expect(expId).toBeDefined();
    expect(created.data.revision).toBe(1);

    // 2. Query experiment list & detail
    const listRes = await fetch(`${baseUrl}/api/v1/experiments`);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.some((item: { id: string }) => item.id === expId)).toBe(true);

    const getRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}`);
    expect(getRes.status).toBe(200);

    // 3. Stale revision update yields 409 CAS Conflict
    const conflictRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/parameters`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 99,
        parameters: { capacity: 300 }
      })
    });
    expect(conflictRes.status).toBe(409);

    // 4. Valid revision update succeeds and advances revision
    const updateRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/parameters`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 1,
        parameters: { capacity: 300 }
      })
    });
    expect(updateRes.status).toBe(200);
    const updatedBody = await updateRes.json();
    expect(updatedBody.data.revision).toBe(2);

    // 5. Confirm caliber
    const confirmRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, hostReviewRef: 'REVIEWER-01' })
    });
    expect(confirmRes.status).toBe(200);

    // 6. Propose patch
    const proposeRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '将日发货能力改为350' })
    });
    expect(proposeRes.status).toBe(200);
    const propBody = await proposeRes.json();
    expect(propBody.data.patch.capacity).toBe(350);

    // 7. Run simulation
    const runRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2 })
    });
    expect(runRes.status).toBe(200);
    const runBody = await runRes.json();
    expect(runBody.data.run.payload.validationPassed).toBe(true);
    const runId = runBody.data.run.runId;
    const opId = runBody.data.receipt.operationId;

    // 7a. Verify GET /api/v1/models & /api/v1/models/:modelId
    const modelsRes = await fetch(`${baseUrl}/api/v1/models`);
    expect(modelsRes.status).toBe(200);
    const modelsBody = await modelsRes.json();
    expect(modelsBody.data[0].modelId).toBe('simlab-daily-fifo-0.1.0');

    const singleModelRes = await fetch(`${baseUrl}/api/v1/models/simlab-daily-fifo-0.1.0`);
    expect(singleModelRes.status).toBe(200);

    // 7b. Verify GET /api/v1/tools & /api/v1/tools/:toolName
    const toolsRes = await fetch(`${baseUrl}/api/v1/tools`);
    expect(toolsRes.status).toBe(200);
    const toolsBody = await toolsRes.json();
    expect(toolsBody.data).toHaveLength(13);

    const singleToolRes = await fetch(`${baseUrl}/api/v1/tools/run_experiment`);
    expect(singleToolRes.status).toBe(200);

    // 7c. Verify GET /api/v1/operations/:opId
    const opRes = await fetch(`${baseUrl}/api/v1/operations/${opId}`);
    expect(opRes.status).toBe(200);
    const opBody = await opRes.json();
    expect(opBody.data.operationId).toBe(opId);

    // 7d. Verify GET /api/v1/runs/:runId & /api/v1/runs/:runId/evidence
    const singleRunRes = await fetch(`${baseUrl}/api/v1/runs/${runId}`);
    expect(singleRunRes.status).toBe(200);

    const evidenceRes = await fetch(`${baseUrl}/api/v1/runs/${runId}/evidence?scenario=baseline&kind=thresholds`);
    expect(evidenceRes.status).toBe(200);
    const evidenceBody = await evidenceRes.json();
    expect(evidenceBody.data.thresholds.minCash).toBeDefined();

    // 8. Create & list snapshots
    const snapRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostFreezeRef: 'FREEZE-01' })
    });
    expect(snapRes.status).toBe(201);

    const listSnapRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/snapshots`);
    expect(listSnapRes.status).toBe(200);
    const snaps = await listSnapRes.json();
    expect(snaps.data).toHaveLength(1);

    // 9. Export run result
    const exportRes = await fetch(`${baseUrl}/api/v1/experiments/${expId}/export`);
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    expect(exported.agentMode).toBe('scripted-no-Pi-no-LLM');

    // 10. JuanerAI Plugin Seam integration
    const pluginSeam = new JuanerAiPluginSeam(service);
    const seamCtx = await pluginSeam.getContext(expId);
    expect(seamCtx.experimentId).toBe(expId);
    expect(seamCtx.modelVersion).toBe('simlab-daily-fifo-0.1.0');

    const metrics = await pluginSeam.exportMetricsForHost(expId);
    expect(metrics.length).toBeGreaterThanOrEqual(9);
    expect(metrics.some(m => m.metricName === 'contribution_profit')).toBe(true);
  });
});
