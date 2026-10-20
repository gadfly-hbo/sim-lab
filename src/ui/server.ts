import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  SimLabService,
  CaliberNotConfirmedError,
  CASConflictError,
  ExperimentNotFoundError,
  UnsupportedModelError,
  UnknownOperationPendingError,
  StaleProposalError,
  AuthorityRequiredError,
  IdempotencyConflictError,
  InputHashMismatchError
} from '../service/index.js';
import { MODEL_VERSION, CORE_SHA256, SCENARIOS, PARAM_RULES } from '../kernel/index.js';
import { createSimulationTools } from '../tools/index.js';

export interface ServerInstance {
  server: http.Server;
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  service?: SimLabService;
  staticDir?: string;
}

export function createHttpServer(options: ServerOptions = {}): {
  server: http.Server;
  start: () => Promise<ServerInstance>;
} {
  const service = options.service || new SimLabService();
  const staticDir = options.staticDir || process.cwd();

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Helper for sending JSON
    const sendJson = (statusCode: number, data: unknown) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };

    // Helper for parsing JSON body
    const parseBody = async (): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
          raw += chunk;
        });
        req.on('end', () => {
          if (!raw.trim()) {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error('Invalid JSON body'));
          }
        });
        req.on('error', reject);
      });
    };

    try {
      // 1. Static file routes
      if (req.method === 'GET') {
        if (pathname === '/' || pathname === '/index.html') {
          const filePath = path.join(staticDir, 'index.html');
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        if (pathname === '/style.css') {
          const filePath = path.join(staticDir, 'style.css');
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        if (pathname === '/app.js') {
          const filePath = path.join(staticDir, 'app.js');
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        if (pathname === '/simulation-core.js') {
          const filePath = path.join(staticDir, 'simulation-core.js');
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }
        if (pathname === '/favicon.ico') {
          res.statusCode = 204;
          res.end();
          return;
        }
      }

      // 2. REST API: /api/v1/health
      if (pathname === '/api/v1/health' && req.method === 'GET') {
        sendJson(200, {
          status: 'ok',
          modelVersion: MODEL_VERSION,
          coreSha256: CORE_SHA256,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // 3. REST API: /api/v1/models
      if (pathname === '/api/v1/models' && req.method === 'GET') {
        sendJson(200, {
          status: 'success',
          data: [
            {
              modelId: MODEL_VERSION,
              coreHash: CORE_SHA256,
              scenarios: SCENARIOS,
              parameterRules: PARAM_RULES,
              unmodeledCapabilities: ['多仓调拨', '退货回仓', '随机分布蒙特卡洛', '账期融资']
            }
          ]
        });
        return;
      }

      const modelMatch = pathname.match(/^\/api\/v1\/models\/([^/]+)$/);
      if (modelMatch && req.method === 'GET') {
        const modelId = decodeURIComponent(modelMatch[1]);
        if (modelId !== MODEL_VERSION && modelId !== 'simlab-daily-fifo-0.1.0') {
          sendJson(404, { status: 'error', error: { code: 'MODEL_NOT_FOUND', message: `Model ${modelId} not found` } });
          return;
        }
        sendJson(200, {
          status: 'success',
          data: {
            modelId: MODEL_VERSION,
            coreHash: CORE_SHA256,
            scenarios: SCENARIOS,
            parameterRules: PARAM_RULES,
            unmodeledCapabilities: ['多仓调拨', '退货回仓', '随机分布蒙特卡洛', '账期融资']
          }
        });
        return;
      }

      // 4. REST API: /api/v1/tools
      if (pathname === '/api/v1/tools' && req.method === 'GET') {
        const tools = createSimulationTools(service);
        sendJson(200, {
          status: 'success',
          data: tools.map(t => ({
            name: t.name,
            description: t.description,
            effect: t.effect,
            parameters: t.parameters,
            resourceUnits: t.resourceUnits
          }))
        });
        return;
      }

      const toolMatch = pathname.match(/^\/api\/v1\/tools\/([^/]+)$/);
      if (toolMatch && req.method === 'GET') {
        const toolName = decodeURIComponent(toolMatch[1]);
        const tools = createSimulationTools(service);
        const tool = tools.find(t => t.name === toolName);
        if (!tool) {
          sendJson(404, { status: 'error', error: { code: 'TOOL_NOT_FOUND', message: `Tool ${toolName} not found` } });
          return;
        }
        sendJson(200, {
          status: 'success',
          data: {
            name: tool.name,
            description: tool.description,
            effect: tool.effect,
            parameters: tool.parameters,
            resourceUnits: tool.resourceUnits
          }
        });
        return;
      }

      // 5. REST API: /api/v1/operations/:opId
      const opMatch = pathname.match(/^\/api\/v1\/operations\/([^/]+)$/);
      if (opMatch && req.method === 'GET') {
        const opId = decodeURIComponent(opMatch[1]);
        const receipt = await service.getOperation(opId);
        if (!receipt) {
          sendJson(404, { status: 'error', error: { code: 'OPERATION_NOT_FOUND', message: `Operation ${opId} not found` } });
          return;
        }
        sendJson(200, { status: 'success', data: receipt });
        return;
      }

      // 6. REST API: /api/v1/runs/:runId/evidence
      const evidenceMatch = pathname.match(/^\/api\/v1\/runs\/([^/]+)\/evidence$/);
      if (evidenceMatch && req.method === 'GET') {
        const runId = decodeURIComponent(evidenceMatch[1]);
        const scenario = (url.searchParams.get('scenario') || 'baseline') as 'baseline' | 'advance' | 'split';
        const kind = (url.searchParams.get('kind') || 'summary') as 'summary' | 'day' | 'ledger' | 'thresholds' | 'sensitivity' | 'conservation';
        const dayParam = url.searchParams.get('day');
        const day = dayParam !== null ? parseInt(dayParam, 10) : undefined;

        const evidence = await service.readEvidence(runId, scenario, kind, day);
        if (!evidence) {
          sendJson(404, { status: 'error', error: { code: 'EVIDENCE_NOT_FOUND', message: `Evidence not found for run ${runId}` } });
          return;
        }
        sendJson(200, { status: 'success', data: evidence });
        return;
      }

      // 7. REST API: /api/v1/runs/:runId
      const runMatch = pathname.match(/^\/api\/v1\/runs\/([^/]+)$/);
      if (runMatch && req.method === 'GET') {
        const runId = decodeURIComponent(runMatch[1]);
        const runInfo = await service.getRun(runId);
        if (!runInfo) {
          sendJson(404, { status: 'error', error: { code: 'RUN_NOT_FOUND', message: `Run ${runId} not found` } });
          return;
        }
        sendJson(200, { status: 'success', data: runInfo });
        return;
      }

      // 3. REST API: /api/v1/experiments (list & create)
      if (pathname === '/api/v1/experiments') {
        if (req.method === 'GET') {
          const list = await service.getStore().list();
          sendJson(200, { status: 'success', data: list });
          return;
        }
        if (req.method === 'POST') {
          const body = await parseBody();
          const goal = body.goal as string;
          const name = body.name as string | undefined;
          const initialParams = body.initialParams as Record<string, unknown> | undefined;
          const hostAcceptanceRef = body.hostAcceptanceRef as string | undefined;

          if (!goal) {
            sendJson(400, { status: 'error', error: { code: 'INVALID_REQUEST', message: 'goal is required' } });
            return;
          }

          const draft = await service.createExperiment(goal, name, initialParams, hostAcceptanceRef);
          sendJson(201, { status: 'success', data: draft });
          return;
        }
      }

      // Path matching for /api/v1/experiments/:id/...
      const expMatch = pathname.match(/^\/api\/v1\/experiments\/([^/]+)(?:\/(.*))?$/);
      if (expMatch) {
        const experimentId = decodeURIComponent(expMatch[1]);
        const subAction = expMatch[2] || '';

        // GET /api/v1/experiments/:id
        if (!subAction && req.method === 'GET') {
          const draft = await service.getExperiment(experimentId);
          sendJson(200, { status: 'success', data: draft });
          return;
        }

        // PUT /api/v1/experiments/:id/parameters
        if (subAction === 'parameters' && req.method === 'PUT') {
          const body = await parseBody();
          const ifMatchHeader = req.headers['if-match'];
          let expectedRevision = Number(body.expectedRevision);
          if (ifMatchHeader) {
            const parsed = parseInt(ifMatchHeader.replace(/"/g, ''), 10);
            if (!isNaN(parsed)) expectedRevision = parsed;
          }

          if (isNaN(expectedRevision)) {
            sendJson(400, { status: 'error', error: { code: 'INVALID_REQUEST', message: 'expectedRevision or If-Match header is required' } });
            return;
          }

          const params = (body.parameters || body) as Record<string, unknown>;
          const updated = await service.updateParameters(experimentId, params, expectedRevision);
          sendJson(200, { status: 'success', data: updated });
          return;
        }

        // POST /api/v1/experiments/:id/confirm
        if (subAction === 'confirm' && req.method === 'POST') {
          const body = await parseBody();
          const expectedRevision = Number(body.expectedRevision);
          const hostReviewRef = (body.hostReviewRef as string | undefined) || 'HOST-REVIEW-UI';

          if (isNaN(expectedRevision)) {
            sendJson(400, { status: 'error', error: { code: 'INVALID_REQUEST', message: 'expectedRevision is required' } });
            return;
          }

          const draft = await service.confirmCaliber(experimentId, expectedRevision, hostReviewRef);
          sendJson(200, { status: 'success', data: draft });
          return;
        }

        // POST /api/v1/experiments/:id/propose
        if (subAction === 'propose' && req.method === 'POST') {
          const body = await parseBody();
          const prompt = body.prompt as string | undefined;
          const patch = body.patch as Record<string, unknown> | undefined;

          const proposal = await service.proposePatch(experimentId, patch || prompt || '');
          sendJson(200, { status: 'success', data: proposal });
          return;
        }

        // POST /api/v1/experiments/:id/adopt
        if (subAction === 'adopt' && req.method === 'POST') {
          const body = await parseBody();
          const proposalId = body.proposalId as string;
          const expectedRevision = Number(body.expectedRevision);
          const hostAcceptanceRef = (body.hostAcceptanceRef as string | undefined) || 'HOST-ACCEPT-UI';

          if (!proposalId || isNaN(expectedRevision)) {
            sendJson(400, { status: 'error', error: { code: 'INVALID_REQUEST', message: 'proposalId and expectedRevision are required' } });
            return;
          }

          const draft = await service.adoptProposal(experimentId, proposalId, expectedRevision, hostAcceptanceRef);
          sendJson(200, { status: 'success', data: draft });
          return;
        }

        // POST /api/v1/experiments/:id/discard
        if (subAction === 'discard' && req.method === 'POST') {
          const draft = await service.discardProposal(experimentId);
          sendJson(200, { status: 'success', data: draft });
          return;
        }

        // POST /api/v1/experiments/:id/run
        if (subAction === 'run' && req.method === 'POST') {
          const body = await parseBody();
          const expectedRevision = Number(body.expectedRevision);
          const faultMode = body.faultMode as 'normal' | 'unknown' | 'failed' | undefined;
          const idempotencyKey = body.idempotencyKey as string | undefined;
          const inputHash = body.inputHash as string | undefined;
          const modelVersion = body.modelVersion as string | undefined;
          const requestedEvidence = body.requestedEvidence as string[] | undefined;

          if (isNaN(expectedRevision)) {
            sendJson(400, { status: 'error', error: { code: 'INVALID_REQUEST', message: 'expectedRevision is required' } });
            return;
          }

          const res = await service.runSimulation(experimentId, expectedRevision, {
            faultMode,
            idempotencyKey,
            inputHash,
            modelVersion,
            requestedEvidence
          });
          sendJson(200, { status: 'success', data: res });
          return;
        }

        // POST /api/v1/experiments/:id/cancel
        if (subAction === 'cancel' && req.method === 'POST') {
          const body = await parseBody();
          const operationId = body.operationId as string;
          const hostStopRef = body.hostStopRef as string | undefined;

          if (!operationId) {
            sendJson(400, { status: 'error', error: { code: 'INVALID_REQUEST', message: 'operationId is required' } });
            return;
          }

          const receipt = await service.cancelSimulation(experimentId, operationId, hostStopRef);
          sendJson(200, { status: 'success', data: receipt });
          return;
        }

        // POST /api/v1/experiments/:id/reconcile
        if (subAction === 'reconcile' && req.method === 'POST') {
          const body = await parseBody();
          const operationId = body.operationId as string;

          if (!operationId) {
            sendJson(400, { status: 'error', error: { code: 'INVALID_REQUEST', message: 'operationId is required' } });
            return;
          }

          const receipt = await service.reconcileOperation(experimentId, operationId);
          sendJson(200, { status: 'success', data: receipt });
          return;
        }

        // POST /api/v1/experiments/:id/snapshots
        if (subAction === 'snapshots' && req.method === 'POST') {
          const body = await parseBody();
          const hostFreezeRef = (body.hostFreezeRef as string | undefined) || 'HOST-FREEZE-UI';

          const snapshot = await service.freezeSnapshot(experimentId, hostFreezeRef);
          sendJson(201, { status: 'success', data: snapshot });
          return;
        }

        // GET /api/v1/experiments/:id/snapshots
        if (subAction === 'snapshots' && req.method === 'GET') {
          const snapshots = await service.listSnapshots(experimentId);
          sendJson(200, { status: 'success', data: snapshots });
          return;
        }

        // GET /api/v1/experiments/:id/export
        if (subAction === 'export' && req.method === 'GET') {
          const draft = await service.getExperiment(experimentId);
          if (!draft.latestRun || draft.latestRun.isStale) {
            sendJson(400, { status: 'error', error: { code: 'STALE_RUN', message: 'Latest run is missing or stale' } });
            return;
          }

          sendJson(200, {
            ...draft.latestRun.payload,
            revision: draft.latestRun.revision,
            operationId: draft.latestRun.operationId,
            agentMode: 'scripted-no-Pi-no-LLM',
            exportedAt: new Date().toISOString()
          });
          return;
        }
      }

      // Default 404
      sendJson(404, { status: 'error', error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${pathname}` } });
    } catch (err: unknown) {
      if (err instanceof CASConflictError) {
        sendJson(409, { status: 'error', error: { code: 'CAS_CONFLICT', message: err.message } });
        return;
      }
      if (err instanceof ExperimentNotFoundError) {
        sendJson(404, { status: 'error', error: { code: 'NOT_FOUND', message: err.message } });
        return;
      }
      if (err instanceof AuthorityRequiredError) {
        sendJson(403, { status: 'error', error: { code: 'AUTHORITY_REQUIRED', message: err.message, credentialName: err.credentialName } });
        return;
      }
      if (err instanceof IdempotencyConflictError) {
        sendJson(409, { status: 'error', error: { code: 'IDEMPOTENCY_CONFLICT', message: err.message } });
        return;
      }
      if (err instanceof InputHashMismatchError) {
        sendJson(400, { status: 'error', error: { code: 'INPUT_HASH_MISMATCH', message: err.message } });
        return;
      }
      if (err instanceof CaliberNotConfirmedError) {
        sendJson(400, { status: 'error', error: { code: 'CALIBER_NOT_CONFIRMED', message: err.message } });
        return;
      }
      if (err instanceof UnsupportedModelError) {
        sendJson(400, { status: 'error', error: { code: 'UNSUPPORTED_MODEL', message: err.message } });
        return;
      }
      if (err instanceof UnknownOperationPendingError) {
        sendJson(409, { status: 'error', error: { code: 'UNKNOWN_OPERATION_PENDING', message: err.message, retry: 'query_only' } });
        return;
      }
      if (err instanceof StaleProposalError) {
        sendJson(400, { status: 'error', error: { code: 'STALE_PROPOSAL', message: err.message } });
        return;
      }

      const e = err as Error;
      sendJson(500, { status: 'error', error: { code: 'INTERNAL_ERROR', message: e.message } });
    }
  });

  return {
    server,
    async start(): Promise<ServerInstance> {
      const initialPort = options.port || 4175;
      const host = options.host || '127.0.0.1';

      return new Promise((resolve, reject) => {
        let currentPort = initialPort;

        const attemptListen = (p: number) => {
          server.once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
              console.warn(`Port ${p} is in use, trying port ${p + 1}...`);
              attemptListen(p + 1);
            } else {
              reject(err);
            }
          });

          server.listen(p, host, () => {
            currentPort = p;
            const url = `http://${host}:${currentPort}`;
            resolve({
              server,
              port: currentPort,
              host,
              url,
              close: async () => {
                return new Promise((res, rej) => {
                  server.close(e => (e ? rej(e) : res()));
                });
              }
            });
          });
        };

        attemptListen(initialPort);
      });
    }
  };
}

export async function startUiServer(port = 4175, host = '127.0.0.1'): Promise<ServerInstance> {
  const { start } = createHttpServer({ port, host });
  const instance = await start();
  console.log(`\n======================================================`);
  console.log(`  SimLab v0.2 仿真实验室工作台服务已就绪`);
  console.log(`  本地地址: \x1b[36m${instance.url}\x1b[0m`);
  console.log(`  按 Ctrl+C 可停止服务`);
  console.log(`======================================================\n`);

  if (process.env.SIMLAB_NO_OPEN !== '1') {
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try {
      const cp = await import('node:child_process');
      console.log(`正在打开系统默认浏览器: ${instance.url} ...`);
      cp.spawn(openCmd, [instance.url], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      // Ignore open error
    }
  }

  return instance;
}
