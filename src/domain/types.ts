/**
 * Domain types shared by the calculation engine, persistence and UI.
 * Amounts are plain numbers; the engine rounds monetary stages to 2 decimals.
 */

/** Base used to charge the card commission. */
export type CommissionBase = 'usd' | 'ves';

/** Base used by the interbank fee. */
export type InterbankBase = 'initial' | 'net';

/** Base used by the IGTF surcharge. */
export type IgtfBase = 'card' | 'investment';

/** Calculator input mode: invest Bs.S or request an exact USD amount from the bank. */
export type CalculationMode = 'bs' | 'usd';

export type RateKey = 'bcv' | 'binance';
export type RateSource = 'manual' | 'auto';
export type ThemeMode = 'light' | 'dark';
export type Profitability = 'green' | 'yellow' | 'red';

export interface RateQuote {
  /** Bs.S per USD. 0 means "not configured yet". */
  value: number;
  /** ISO timestamp of the last manual edit or automatic update. */
  updatedAt: string | null;
  source: RateSource;
}

export interface Rates {
  bcv: RateQuote;
  binance: RateQuote;
}

export interface BankProfile {
  id: string;
  name: string;
  /** Card commission percentage (0-100). */
  cardCommissionPct: number;
  cardCommissionBase: CommissionBase;
  /** Binance deposit commission percentage (0-100). */
  binanceDepositPct: number;
  /** Fixed Binance deposit commission in USD. */
  binanceDepositFixedUsd: number;
  interbankEnabled: boolean;
  /** Interbank fee percentage (0-100). */
  interbankPct: number;
  interbankBase: InterbankBase;
  igtfEnabled: boolean;
  /** IGTF percentage (0-100). */
  igtfPct: number;
  igtfBase: IgtfBase;
  slippageEnabled: boolean;
  /** Slippage percentage (0-100). */
  slippagePct: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Editable fields of a bank profile (id/timestamps are assigned by the store). */
export type BankProfileDraft = Omit<BankProfile, 'id' | 'createdAt' | 'updatedAt'>;

/** Effective optional-cost switches for one calculation (profile defaults + UI overrides). */
export interface CalculationOptions {
  interbankEnabled: boolean;
  igtfEnabled: boolean;
  slippageEnabled: boolean;
}

export interface CalculationInput {
  mode: CalculationMode;
  /** Bs.S amount in `bs` mode; USD amount requested from the bank in `usd` mode. */
  amount: number;
  bcvRate: number;
  binanceRate: number;
  profile: BankProfile;
  options: CalculationOptions;
}

export type WaterfallKind = 'input' | 'cost' | 'subtotal' | 'output' | 'info';

export interface WaterfallLine {
  key: string;
  label: string;
  /** Signed amount in Bs.S; null when the line is not expressed in Bs.S. */
  amountBs: number | null;
  /** Signed amount in USD; null when the line is not expressed in USD. */
  amountUsd: number | null;
  kind: WaterfallKind;
  detail?: string;
}

/** Immutable fee/rate snapshot stored with every purchase for reproducibility. */
export interface CalculationSnapshot {
  profileId: string;
  profileName: string;
  mode: CalculationMode;
  inputAmount: number;
  amountBs: number;
  bcvRate: number;
  binanceRate: number;
  interventionPct: number;
  interventionFeeBs: number;
  netForPurchaseBs: number;
  cardCommissionPct: number;
  cardCommissionBase: CommissionBase;
  cardCommissionUsd: number;
  cardCommissionBs: number;
  binanceDepositPct: number;
  binanceDepositFixedUsd: number;
  binanceDepositUsd: number;
  interbankEnabled: boolean;
  interbankPct: number;
  interbankBase: InterbankBase;
  interbankCostBs: number;
  igtfEnabled: boolean;
  igtfPct: number;
  igtfBase: IgtfBase;
  igtfCostBs: number;
  slippageEnabled: boolean;
  slippagePct: number;
}

export interface CalculationResult {
  mode: CalculationMode;
  inputAmount: number;
  amountBs: number;
  interventionFeeBs: number;
  netForPurchaseBs: number;
  /** USD credited at the bank (USD_1). */
  usdBought: number;
  /** USD that travels through the Binance gateway (USD_2). */
  usdForBinance: number;
  /** USDT net in wallet after Binance fees (USD_3). */
  usdDeposited: number;
  cardCommissionUsd: number;
  cardCommissionBs: number;
  binanceFeeUsd: number;
  interbankCostBs: number;
  igtfCostBs: number;
  binanceEffectiveRate: number;
  bsOut: number;
  totalCostBs: number;
  netProfitBs: number;
  roiPct: number;
  breakEvenRate: number;
  minGapPct: number;
  profitability: Profitability;
  snapshot: CalculationSnapshot;
  waterfall: WaterfallLine[];
}

export type PurchaseStatus =
  | 'pending'
  | 'usd_credited'
  | 'deposited_binance'
  | 'completed'
  | 'cancelled';

export type AccreditationType = 'TOTAL' | 'PARTIAL';

export interface StatusChangeMetadata {
  accreditationType?: AccreditationType;
  requestedInvestmentVes?: number;
  requestedUsd?: number;
  accreditedUsd?: number;
  accreditationRatePercent?: number;
  executedInvestmentVes?: number;
  refundedVes?: number;
  keepInterbankSunk?: boolean;
}

export interface StatusChange {
  id: string;
  timestamp: string;
  fromStatus: PurchaseStatus | null;
  toStatus: PurchaseStatus;
  note: string;
  metadata?: StatusChangeMetadata;
}

export interface PurchaseExecution {
  realBinanceRate: number;
  executedBsOut: number;
  executedProfitBs: number;
  executedRoiPct: number;
  closedAt: string;
}

export interface PurchaseRecord {
  id: string;
  createdAt: string;
  profileId: string;
  /** Profile name snapshot (kept if the profile is later deleted). */
  profileName: string;
  mode: CalculationMode;
  inputAmount: number;
  /** Executed Bs.S debited by the bank (updated after a partial accreditation). */
  amountBs: number;
  bcvRate: number;
  binanceRate: number;
  snapshot: CalculationSnapshot;
  /** Executed USD bought at the bank (updated after a partial accreditation). */
  usdBought: number;
  usdForBinance: number;
  usdDeposited: number;
  totalCostBs: number;
  estimatedBsOut: number;
  estimatedProfitBs: number;
  estimatedRoiPct: number;
  breakEvenRate: number;
  /** Immutable Bs.S committed when the purchase was registered. */
  requestedInvestmentVes: number;
  /** Immutable USD originally requested from the bank (USD_1 theoretical). */
  requestedUsd: number;
  accreditationType: AccreditationType;
  /** USD actually approved by the bank on the confirmed accreditation. */
  accreditedUsd: number;
  accreditationRatePercent: number;
  /** Bs.S actually debited by the bank, including the intervention fee. */
  executedInvestmentVes: number;
  /** Bs.S released back to the current account by the bank. */
  refundedVes: number;
  /** ISO timestamp of the confirmed accreditation; null while pending. */
  accreditationConfirmedAt: string | null;
  status: PurchaseStatus;
  statusHistory: StatusChange[];
  /** Real sale results, present only when the purchase reached `completed`. */
  execution: PurchaseExecution | null;
  notes: string;
}

export interface PurchaseFilters {
  status: PurchaseStatus | 'all';
  /** Exact profile name snapshot, or 'all'. */
  profileName: string;
  dateFrom: string;
  dateTo: string;
}

export interface DisclaimerConfig {
  enabled: boolean;
  text: string;
}

/** Slice persisted by zustand/persist. */
export interface PersistedState {
  schemaVersion: number;
  rates: Rates;
  profiles: BankProfile[];
  purchases: PurchaseRecord[];
  disclaimer: DisclaimerConfig;
  theme: ThemeMode;
}

export interface PurchaseKpis {
  /** Sum of total cost for purchases in transit (pending, usd_credited, deposited). */
  inTransitCapitalBs: number;
  inTransitCount: number;
  /** Sum of executed profit for completed purchases. */
  completedProfitBs: number;
  /** Sum of total cost for completed purchases. */
  completedCostBs: number;
  /** Weighted ROI: completedProfitBs / completedCostBs * 100. */
  weightedRoiPct: number;
  completedCount: number;
  cancelledCount: number;
}
