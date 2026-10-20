export interface SimLabParameters {
  days: 30;
  demand: number;
  inventory: number;
  capacity: number;
  leadTime: number;
  promo: number;
  demandShock: boolean;
  supplyShock: boolean;
  price: number;
  cost: number;
  fulfillmentCost: number;
  holdingCost: number;
  cash: number;
  extraStock: number;
  maxWait: number;
  cashThreshold: number;
  backlogThreshold: number;
  [key: string]: unknown;
}

export type ScenarioId = 'baseline' | 'advance' | 'split';

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  note: string;
  color: string;
}

export interface SensitivityPerturbation {
  capacity?: number;
  demandMultiplier?: number;
  leadTimeDelta?: number;
}

export interface DailyRecord {
  day: number;
  demand: number;
  accepted: number;
  unaccepted: number;
  received: number;
  shipped: number;
  cancelled: number;
  backlog: number;
  inventory: number;
  cash: number;
  purchaseQuantity: number;
  purchasePayment: number;
  revenue: number;
  cogs: number;
  fulfillment: number;
  holding: number;
  contribution: number;
  stockout: boolean;
  cumDemand: number;
  cumAccepted: number;
  cumShipped: number;
  cumCancelled: number;
  cumUnaccepted: number;
  cumRevenue: number;
  cumCost: number;
  cumFulfillment: number;
  cumHolding: number;
  cumPurchases: number;
  cumContribution: number;
  inTransit: number;
}

export interface PurchaseOrder {
  orderDay: number;
  arrivalDay: number;
  quantity: number;
  payment: number;
  type: 'advance' | 'scheduled';
}

export interface DayCheck {
  day: number;
  inventoryResidual: number;
  queueResidual: number;
  cashResidual: number;
  valid: boolean;
}

export interface ScenarioSummary {
  demand: number;
  accepted: number;
  shipped: number;
  cancelled: number;
  unaccepted: number;
  revenue: number;
  cogs: number;
  fulfillment: number;
  holding: number;
  purchases: number;
  contribution: number;
  operatingBalance: number;
  closingInventory: number;
  inventoryValue: number;
  inTransit: number;
  inTransitValue: number;
  closingBacklog: number;
  closingCash: number;
  minCash: number;
  minCashDay: number;
  peakBacklog: number;
  peakBacklogDay: number;
  firstCash: number | null;
  firstBacklog: number | null;
  firstThreshold: number | null;
  firstNegative: number | null;
  stockoutDays: number;
  firstStockout: number | null;
  fulfillmentRate: number | null;
  acceptedFulfillmentRate: number | null;
  cancelRate: number | null;
  avgShippedWait: number;
  sameDayShipped: number;
  openingInventory: number;
  openingCash: number;
  extraStock: number;
  valid: boolean;
}

export interface ScenarioResult {
  scenarioId: ScenarioId;
  perturbation: SensitivityPerturbation;
  summary: ScenarioSummary;
  records: DailyRecord[];
  purchaseOrders: PurchaseOrder[];
  remainingQueue: Array<{ day: number; quantity: number }>;
  remainingPurchaseOrders: Array<{ arrivalDay: number; quantity: number }>;
  checks: DayCheck[];
}

export interface SensitivityItem {
  id: 'demandDown' | 'demandUp' | 'capacityDown' | 'leadUp';
  label: string;
  change: SensitivityPerturbation;
  method: string;
  baselineMinCash: number;
  perturbedMinCash: number;
  deltaMinCash: number;
  firstThreshold: number | null;
  thresholdFlipped: boolean;
  validationPassed: boolean;
}

export interface SimLabRun {
  schemaVersion: '1.0';
  modelVersion: 'simlab-daily-fifo-0.1.0';
  id: string;
  createdAt: string;
  source: string;
  disclaimer: string;
  windowDays: 30;
  parameters: SimLabParameters;
  modelRules: Record<string, unknown>;
  results: Record<ScenarioId, ScenarioResult>;
  sensitivity: Record<ScenarioId, SensitivityItem[]>;
  validationPassed: boolean;
}
