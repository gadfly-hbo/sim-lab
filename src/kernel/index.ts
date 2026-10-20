import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import type {
  SimLabParameters,
  ScenarioDef,
  ScenarioId,
  SensitivityPerturbation,
  ScenarioResult,
  SensitivityItem,
  SimLabRun
} from './types.js';

export * from './types.js';

export const CORE_SHA256 = '8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca';
export const MODEL_VERSION = 'simlab-daily-fifo-0.1.0';

// Locate simulation-core.js reliably in source or dist mode
function findCorePath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'simulation-core.js'),
    path.resolve(__dirname, '../../simulation-core.js'),
    path.resolve(__dirname, '../simulation-core.js'),
    path.resolve(__dirname, 'simulation-core.js')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return path.resolve(process.cwd(), 'simulation-core.js');
}

const coreFilePath = findCorePath();
const coreCode = fs.readFileSync(coreFilePath, 'utf8');

// Verify SHA-256 integrity
const actualSha = crypto.createHash('sha256').update(coreCode).digest('hex');
if (actualSha !== CORE_SHA256) {
  throw new Error(`simulation-core.js SHA256 mismatch! Expected ${CORE_SHA256}, got ${actualSha}`);
}

// Execute in VM context
const sandbox: { module: { exports: Record<string, unknown> }; Date: typeof Date; Math: typeof Math; Number: typeof Number; Object: typeof Object; Array: typeof Array; JSON: typeof JSON } = {
  module: { exports: {} },
  Date,
  Math,
  Number,
  Object,
  Array,
  JSON
};
vm.createContext(sandbox);
vm.runInContext(coreCode, sandbox);

interface RawExports {
  DEFAULTS: SimLabParameters;
  SCENARIOS: ScenarioDef[];
  PARAM_RULES: Record<string, [number, number, boolean]>;
  validateParams: (p: Partial<SimLabParameters>) => void;
  simulate: (p: SimLabParameters, scenarioId: ScenarioId, overrides?: SensitivityPerturbation) => ScenarioResult;
  sensitivityFor: (p: SimLabParameters, scenarioId: ScenarioId, base: ScenarioResult) => SensitivityItem[];
  buildRun: (p: SimLabParameters, sequence?: number) => SimLabRun;
}

const raw = sandbox.module.exports as unknown as RawExports;

export const DEFAULTS: Readonly<SimLabParameters> = Object.freeze(JSON.parse(JSON.stringify(raw.DEFAULTS)));
export const SCENARIOS: readonly ScenarioDef[] = Object.freeze(JSON.parse(JSON.stringify(raw.SCENARIOS)));
export const PARAM_RULES: Readonly<Record<string, [number, number, boolean]>> = Object.freeze(JSON.parse(JSON.stringify(raw.PARAM_RULES)));

export function validateParams(p: Partial<SimLabParameters>): void {
  raw.validateParams(p);
}

export function simulate(
  p: SimLabParameters,
  scenarioId: ScenarioId,
  overrides: SensitivityPerturbation = {}
): ScenarioResult {
  return raw.simulate(p, scenarioId, overrides);
}

export function sensitivityFor(
  p: SimLabParameters,
  scenarioId: ScenarioId,
  base: ScenarioResult
): SensitivityItem[] {
  return raw.sensitivityFor(p, scenarioId, base);
}

export function buildRun(p: SimLabParameters, sequence = 1): SimLabRun {
  return raw.buildRun(p, sequence);
}

/**
 * Computes canonical input hash from 14 business parameters + 2 shocks.
 * Returns format "sha256:<16-char-hex>".
 */
export function computeInputHash(p: Partial<SimLabParameters>): string {
  const merged: SimLabParameters = {
    ...DEFAULTS,
    ...p
  };

  // Canonical list of 17 fields in alphabetical order
  const canonicalFields: (keyof SimLabParameters)[] = [
    'backlogThreshold',
    'capacity',
    'cash',
    'cashThreshold',
    'cost',
    'days',
    'demand',
    'demandShock',
    'extraStock',
    'fulfillmentCost',
    'holdingCost',
    'inventory',
    'leadTime',
    'maxWait',
    'price',
    'promo',
    'supplyShock'
  ];

  const canonicalObj: Record<string, unknown> = {
    _coreSha256: CORE_SHA256,
    _modelVersion: MODEL_VERSION
  };
  for (const f of canonicalFields) {
    canonicalObj[f] = merged[f];
  }

  const jsonStr = JSON.stringify(canonicalObj);
  const fullHex = crypto.createHash('sha256').update(jsonStr).digest('hex');
  return `sha256:${fullHex.slice(0, 16)}`;
}
