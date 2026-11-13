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

/** Field the user last edited in the multi-rate converter. */
export type MultiRateSource = 'VES' | 'SLOT_1' | 'SLOT_2';

export interface MultiRateConversionResult {
  /** Bs.S equivalent for the entered amount. */
  vesAmount: number;
  /** USD equivalent at the Slot 1 rate. */
  slot1Usd: number;
  /** USD equivalent at the Slot 2 rate. */
  slot2Usd: number;
  /** Absolute difference between both USD equivalents. */
  usdDifference: number;
  /** Percentage spread between both slot rates. */
  spreadPercentBetweenSlots: number;
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
  /** Bs.S value of USD_1 at the BCV rate (Base_Bs). */
  baseBs?: number;
  /** Bs.S dedicated to the BCV purchase plus intervention. */
  bcvPurchaseBs?: number;
  cardCommissionPct: number;
  cardCommissionBase: CommissionBase;
  cardCommissionUsd: number;
  cardCommissionBs: number;
  binanceDepositPct: number;
  binanceDepositFixedUsd: number;
  binanceDepositUsd: number;
  /** Percentage-only Binance deposit fee (new records). */
  binancePercentFeeUsd?: number;
  /** Bs.S value of the fixed P2P fee at the effective sale rate (new records). */
  binanceFixedDiscountBs?: number;
  interbankEnabled: boolean;
  interbankPct: number;
  interbankBase: InterbankBase;
  interbankCostBs: number;
  igtfEnabled: boolean;
  igtfPct: number;
  igtfBase: IgtfBase;
  igtfCostBs: number;
  /** IGTF charged in USD when the card charge is USD-denominated (new records). */
  igtfCostUsd?: number;
  slippageEnabled: boolean;
  slippagePct: number;
  /** USDT net after the fixed P2P fee (new records). */
  usdtNet?: number;
  /** Minimum sale rate for zero profit (new records). */
  effectiveBuyRate?: number;
}

export interface CalculationResult {
  mode: CalculationMode;
  inputAmount: number;
  /** Total Bs.S cost of the operation (Base_Bs + all Bs.S fees). */
  amountBs: number;
  interventionFeeBs: number;
  netForPurchaseBs: number;
  /** Bs.S value of USD_1 at the BCV rate (Base_Bs). */
  baseBs: number;
  /** Bs.S dedicated to the BCV purchase plus intervention. */
  bcvPurchaseBs: number;
  /** USD credited at the bank (USD_1). */
  usdBought: number;
  /** USD that travels through the Binance gateway (USD_2). */
  usdForBinance: number;
  /** USDT after the percentage Binance fee and USD IGTF (USD_3, before the fixed P2P fee). */
  usdDeposited: number;
  /** USDT after the fixed P2P fee, ready to sell. */
  usdtNet: number;
  cardCommissionUsd: number;
  cardCommissionBs: number;
  /** Percentage-only Binance deposit fee. */
  binancePercentFeeUsd: number;
  /** Fixed P2P fee in USDT. */
  binanceFixedFeeUsd: number;
  /** Bs.S value of the fixed P2P fee at the effective sale rate. */
  binanceFixedDiscountBs: number;
  /** Legacy total (percentage + fixed) for display compatibility. */
  binanceFeeUsd: number;
  interbankCostBs: number;
  igtfCostBs: number;
  igtfCostUsd: number;
  binanceEffectiveRate: number;
  /** Gross P2P sale value before the fixed P2P fee. */
  grossSaleBs: number;
  bsOut: number;
  totalCostBs: number;
  netProfitBs: number;
  roiPct: number;
  /** Minimum sale rate for zero profit (never depends on binanceRate). */
  effectiveBuyRate: number;
  breakEvenRate: number;
  minGapPct: number;
  profitability: Profitability;
  snapshot: CalculationSnapshot;
  waterfall: WaterfallLine[];
}

export type PurchaseStatus =
  | 'pending'
  | 'approved'
  | 'usd_credited'
  | 'deposited_binance'
  | 'partial'
  | 'completed'
  | 'cancelled';

export type AccreditationType = 'TOTAL' | 'PARTIAL';

export interface SaleLotAllocation {
  allocationId: string;
  saleId: string;
  purchaseId: string;
  allocatedAt: string;
  usdtTaken: number;
  p2pFeeShareUsdt: number;
  netUsdtSold: number;
  sellRateVes: number;
  allocatedCostVes: number;
  allocatedRevenueVes: number;
  allocatedProfitVes: number;
  allocatedRoiPercent: number;
  lotRemainingUsdtAfter: number;
}

export interface SaleRecord {
  id: string;
  createdAt: string;
  notes: string;
  totalUsdtSold: number;
  p2pFixedFeeUsdt: number;
  netUsdtLiquidated: number;
  sellRateVes: number;
  totalVesReceived: number;
  totalAllocatedCostVes: number;
  totalRealizedProfitVes: number;
  realizedRoiPercent: number;
  walletBalanceAfterUsdt: number;
  allocations: SaleLotAllocation[];
}

export interface SaleInput {
  totalUsdtSold: number;
  sellRateVes: number;
  p2pFixedFeeUsdt?: number;
  notes?: string;
}

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

export interface PurchaseRateReference {
  source: 'historical' | 'manual';
  bcvAsOf: string;
  bcvForwardFilled: boolean;
  binanceAsOf: string | null;
  binanceMethod: 'median' | 'average' | 'manual';
}

export interface PurchaseRecordMetadata {
  purchaseDate?: string;
  rateReference?: PurchaseRateReference;
}

export interface PurchaseRecord {
  id: string;
  createdAt: string;
  /** Local calendar date on which the purchase was made, independent of registration time. */
  purchaseDate?: string;
  profileId: string;
  /** Profile name snapshot (kept if the profile is later deleted). */
  profileName: string;
  mode: CalculationMode;
  inputAmount: number;
  /** Executed Bs.S debited by the bank (updated after a partial accreditation). */
  amountBs: number;
  bcvRate: number;
  binanceRate: number;
  rateReference?: PurchaseRateReference;
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
  /** Requested total cost in Bs.S (EN_ESPERA bucket). */
  requestedTotalCostVes?: number;
  /** Executed total cost in Bs.S after bank approval/accreditation. */
  executedTotalCostVes?: number;
  /** Timestamp of the transition to EN_BINANCE (FIFO ordering). */
  fundedToBinanceAt?: string | null;
  /** USDT net that entered the Binance wallet. */
  initialBinanceUsdt?: number;
  /** Real cost per USDT placed in Binance. */
  unitCostInBinanceVes?: number;
  soldUsdt?: number;
  remainingBinanceUsdt?: number;
  allocatedCostVesTotal?: number;
  remainingCostVes?: number;
  realizedRevenueVes?: number;
  realizedProfitVes?: number;
  weightedAverageSellRateVes?: number;
  allocations?: SaleLotAllocation[];
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
  text: string;
  /** True after the first-visit disclaimer has been shown once. */
  hasSeen: boolean;
}

/** Records-table columns with an explicit width; actions stays fixed. */
export type TableColumnKey =
  | 'bank'
  | 'investment'
  | 'outcome'
  | 'profit'
  | 'status'
  | 'actions';

/** Widths in CSS pixels; missing entries fall back to the column defaults. */
export type TableColumnWidths = Partial<Record<TableColumnKey, number>>;

/** Slice persisted by zustand/persist. */
export interface PersistedState {
  schemaVersion: number;
  rates: Rates;
  profiles: BankProfile[];
  purchases: PurchaseRecord[];
  sales: SaleRecord[];
  disclaimer: DisclaimerConfig;
  theme: ThemeMode;
  tableColumnWidths: TableColumnWidths;
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
  /** New bucket: requested cost in EN_ESPERA + executed cost in APROBADO. */
  capitalInTransitVes: number;
  /** USD equivalent requested/approved in transit. */
  capitalInTransitUsd: number;
  /** New bucket: executed cost of ACREDITADO purchases liquid in the bank. */
  capitalInBankVes: number;
  /** USD equivalent of ACREDITADO capital in the bank. */
  capitalInBankUsd: number;
  /** New bucket: remaining cost of EN_BINANCE + EN_BINANCE_PARCIAL inventory. */
  capitalInBinanceVes: number;
  /** Remaining USDT held in Binance inventory. */
  capitalInBinanceUsdt: number;
  /** Realized profit from sales. */
  realizedProfitVes: number;
  /** Realized profit expressed in USDT at the sale rate. */
  realizedProfitUsdt: number;
  /** Weighted realized ROI: realized profit / sold cost. */
  realizedRoiPct: number;
}
