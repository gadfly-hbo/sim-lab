import { describe, it, expect } from 'vitest';
import {
  CORE_SHA256,
  MODEL_VERSION,
  DEFAULTS,
  SCENARIOS,
  PARAM_RULES,
  simulate,
  buildRun,
  sensitivityFor,
  validateParams,
  computeInputHash
} from '../src/kernel/index.js';

describe('Seam S1: Deterministic Kernel & Contracts', () => {
  it('freezes simulation-core SHA256 and model version', () => {
    expect(CORE_SHA256).toBe('8e6d44d5402c595673bb727ed9500aadc8222ac905067c93f69a7e7bcc7a48ca');
    expect(MODEL_VERSION).toBe('simlab-daily-fifo-0.1.0');
    expect(SCENARIOS).toHaveLength(3);
    expect(SCENARIOS.map(s => s.id)).toEqual(['baseline', 'advance', 'split']);
  });

  it('computes exact numerical values matching frozen v0.1 benchmark', () => {
    const res = simulate(DEFAULTS, 'baseline');
    expect(res.summary.valid).toBe(true);
    expect(res.records).toHaveLength(30);
    expect(res.summary.contribution).toBe(274010);
    expect(res.summary.closingCash).toBe(508188.5);
    expect(res.summary.minCash).toBe(110457);
    expect(res.summary.closingInventory).toBe(1010);
    expect(res.summary.shipped).toBe(5830);
    expect(res.summary.cancelled).toBe(1165);
  });

  it('buildRun produces all 3 scenarios and passes conservation', () => {
    const run = buildRun(DEFAULTS, 1);
    expect(run.id).toBe('SIM-001');
    expect(run.validationPassed).toBe(true);
    expect(Object.keys(run.results)).toEqual(['baseline', 'advance', 'split']);
    expect(Object.keys(run.sensitivity)).toEqual(['baseline', 'advance', 'split']);
    expect(run.results.advance.summary.contribution).toBe(316310);
    expect(run.results.split.summary.contribution).toBe(274010);
  });

  it('sensitivity analysis accurately calculates single-variable perturbations', () => {
    const base = simulate(DEFAULTS, 'baseline');
    const sens = sensitivityFor(DEFAULTS, 'baseline', base);
    expect(sens).toHaveLength(4);
    expect(sens.map(s => s.id)).toEqual(['demandDown', 'demandUp', 'capacityDown', 'leadUp']);
    for (const item of sens) {
      expect(item.validationPassed).toBe(true);
    }
  });

  it('validateParams rejects out-of-bound and fractional inputs', () => {
    expect(() => validateParams({ ...DEFAULTS, demand: -1 })).toThrow();
    expect(() => validateParams({ ...DEFAULTS, demand: 5001 })).toThrow();
    expect(() => validateParams({ ...DEFAULTS, demand: 180.5 })).toThrow();
    expect(() => validateParams({ ...DEFAULTS, leadTime: 0 })).toThrow();
    expect(() => validateParams({ ...DEFAULTS, days: 31 })).toThrow();
  });

  it('computeInputHash is deterministic and sensitive to changes', () => {
    const hash1 = computeInputHash(DEFAULTS);
    const hash2 = computeInputHash(DEFAULTS);
    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('sha256:')).toBe(true);

    const hashModified = computeInputHash({ ...DEFAULTS, capacity: 300 });
    expect(hashModified).not.toBe(hash1);
  });
});
