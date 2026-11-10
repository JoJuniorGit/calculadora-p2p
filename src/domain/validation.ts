import { z } from 'zod';

const requiredText = z.string({
  required_error: 'Este campo es obligatorio',
  invalid_type_error: 'Debe ser un texto',
});
const requiredBoolean = z.boolean({
  required_error: 'Este campo es obligatorio',
  invalid_type_error: 'Debe ser verdadero o falso',
});
const finiteNumber = z
  .number({
    required_error: 'Este campo es obligatorio',
    invalid_type_error: 'Debe ser un número',
  })
  .finite({ message: 'Debe ser un número finito' });

const nonNegativeNumber = finiteNumber.min(0, {
  message: 'Debe ser mayor o igual a 0',
});
const positiveNumber = finiteNumber.gt(0, { message: 'Debe ser mayor que 0' });
const percentageNumber = finiteNumber.min(0, {
  message: 'El porcentaje debe ser mayor o igual a 0',
}).max(100, { message: 'El porcentaje no puede superar 100' });

const enumErrorMap: z.ZodErrorMap = (issue) => ({
  message:
    issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined'
      ? 'Este campo es obligatorio'
      : 'El valor seleccionado no es válido',
});

const objectParams = {
  required_error: 'Este campo es obligatorio',
  invalid_type_error: 'Debe ser un objeto',
};
const arrayParams = {
  required_error: 'Este campo es obligatorio',
  invalid_type_error: 'Debe ser una lista',
};

export const rateQuoteSchema = z.object(
  {
    value: nonNegativeNumber,
    source: z.enum(['manual', 'auto'], { errorMap: enumErrorMap }),
    updatedAt: requiredText.nullable(),
  },
  objectParams,
);

export const ratesSchema = z.object(
  {
    bcv: rateQuoteSchema,
    binance: rateQuoteSchema,
  },
  objectParams,
);

export const commissionBaseSchema = z.enum(['usd', 'ves'], { errorMap: enumErrorMap });
export const interbankBaseSchema = z.enum(['initial', 'net'], { errorMap: enumErrorMap });
export const igtfBaseSchema = z.enum(['card', 'investment'], { errorMap: enumErrorMap });
export const themeSchema = z.enum(['light', 'dark'], { errorMap: enumErrorMap });

export const bankProfileSchema = z.object(
  {
    id: requiredText.min(1, { message: 'El identificador es obligatorio' }),
    name: z
      .string({
        required_error: 'El nombre del banco es obligatorio',
        invalid_type_error: 'El nombre del banco debe ser un texto',
      })
      .trim()
      .min(1, { message: 'El nombre del banco es obligatorio' }),
    cardCommissionPct: percentageNumber,
    cardCommissionBase: commissionBaseSchema,
    binanceDepositPct: percentageNumber,
    binanceDepositFixedUsd: nonNegativeNumber,
    interbankEnabled: requiredBoolean,
    interbankPct: percentageNumber,
    interbankBase: interbankBaseSchema,
    igtfEnabled: requiredBoolean,
    igtfPct: percentageNumber,
    igtfBase: igtfBaseSchema,
    slippageEnabled: requiredBoolean,
    slippagePct: percentageNumber,
    notes: requiredText,
    createdAt: requiredText,
    updatedAt: requiredText,
  },
  objectParams,
);

export const bankProfileDraftSchema = bankProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const calculationOptionsSchema = z.object(
  {
    interbankEnabled: requiredBoolean,
    igtfEnabled: requiredBoolean,
    slippageEnabled: requiredBoolean,
  },
  objectParams,
);

export const calculationSnapshotSchema = z.object(
  {
    profileId: requiredText.min(1, { message: 'El identificador es obligatorio' }),
    profileName: requiredText.min(1, { message: 'El nombre del banco es obligatorio' }),
    mode: z.enum(['bs', 'usd'], { errorMap: enumErrorMap }),
    inputAmount: positiveNumber,
    amountBs: positiveNumber,
    bcvRate: positiveNumber,
    binanceRate: positiveNumber,
    interventionPct: percentageNumber,
    interventionFeeBs: nonNegativeNumber,
    netForPurchaseBs: positiveNumber,
    cardCommissionPct: percentageNumber,
    cardCommissionBase: commissionBaseSchema,
    cardCommissionUsd: nonNegativeNumber,
    cardCommissionBs: nonNegativeNumber,
    binanceDepositPct: percentageNumber,
    binanceDepositFixedUsd: nonNegativeNumber,
    binanceDepositUsd: nonNegativeNumber,
    interbankEnabled: requiredBoolean,
    interbankPct: percentageNumber,
    interbankBase: interbankBaseSchema,
    interbankCostBs: nonNegativeNumber,
    igtfEnabled: requiredBoolean,
    igtfPct: percentageNumber,
    igtfBase: igtfBaseSchema,
    igtfCostBs: nonNegativeNumber,
    slippageEnabled: requiredBoolean,
    slippagePct: percentageNumber,
  },
  objectParams,
);

export const purchaseStatusSchema = z.enum(
  ['pending', 'usd_credited', 'deposited_binance', 'completed', 'cancelled'],
  { errorMap: enumErrorMap },
);

export const statusChangeSchema = z.object(
  {
    id: requiredText.min(1, { message: 'El identificador es obligatorio' }),
    timestamp: requiredText,
    fromStatus: purchaseStatusSchema.nullable(),
    toStatus: purchaseStatusSchema,
    note: requiredText,
  },
  objectParams,
);

export const purchaseExecutionSchema = z.object(
  {
    realBinanceRate: positiveNumber,
    executedBsOut: positiveNumber,
    executedProfitBs: finiteNumber,
    executedRoiPct: finiteNumber,
    closedAt: requiredText,
  },
  objectParams,
);

export const purchaseRecordSchema = z.object(
  {
    id: requiredText.min(1, { message: 'El identificador es obligatorio' }),
    createdAt: requiredText,
    profileId: requiredText.min(1, { message: 'El identificador es obligatorio' }),
    profileName: requiredText.min(1, { message: 'El nombre del banco es obligatorio' }),
    mode: z.enum(['bs', 'usd'], { errorMap: enumErrorMap }),
    inputAmount: positiveNumber,
    amountBs: positiveNumber,
    bcvRate: positiveNumber,
    binanceRate: positiveNumber,
    snapshot: calculationSnapshotSchema,
    usdBought: positiveNumber,
    usdForBinance: positiveNumber,
    usdDeposited: positiveNumber,
    totalCostBs: positiveNumber,
    estimatedBsOut: positiveNumber,
    estimatedProfitBs: finiteNumber,
    estimatedRoiPct: finiteNumber,
    breakEvenRate: positiveNumber,
    status: purchaseStatusSchema,
    statusHistory: z.array(statusChangeSchema, arrayParams),
    execution: purchaseExecutionSchema.nullable(),
    notes: requiredText,
  },
  objectParams,
);

export const purchaseFiltersSchema = z.object(
  {
    status: z.enum(
      ['pending', 'usd_credited', 'deposited_binance', 'completed', 'cancelled', 'all'],
      { errorMap: enumErrorMap },
    ),
    profileName: requiredText,
    dateFrom: requiredText,
    dateTo: requiredText,
  },
  objectParams,
);

export const disclaimerSchema = z.object(
  {
    enabled: requiredBoolean,
    text: requiredText,
  },
  objectParams,
);

export const persistedStateSchema = z.object(
  {
    schemaVersion: finiteNumber
      .int({ message: 'La versión del esquema debe ser un entero' })
      .min(1, { message: 'La versión del esquema debe ser mayor que 0' }),
    rates: ratesSchema,
    profiles: z.array(bankProfileSchema, arrayParams),
    purchases: z.array(purchaseRecordSchema, arrayParams),
    disclaimer: disclaimerSchema,
    theme: themeSchema,
  },
  objectParams,
);

export const purchasesExportSchema = z.object(
  {
    schemaVersion: finiteNumber
      .int({ message: 'La versión del esquema debe ser un entero' })
      .min(1, { message: 'La versión del esquema debe ser mayor que 0' }),
    exportedAt: requiredText,
    purchases: z.array(purchaseRecordSchema, arrayParams),
  },
  objectParams,
);

export const configExportSchema = persistedStateSchema.extend({
  exportedAt: requiredText,
});

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'general';
    return `${path}: ${issue.message}`;
  });
}

export type RateQuoteData = z.infer<typeof rateQuoteSchema>;
export type RatesData = z.infer<typeof ratesSchema>;
export type CommissionBaseData = z.infer<typeof commissionBaseSchema>;
export type InterbankBaseData = z.infer<typeof interbankBaseSchema>;
export type IgtfBaseData = z.infer<typeof igtfBaseSchema>;
export type ThemeData = z.infer<typeof themeSchema>;
export type BankProfileData = z.infer<typeof bankProfileSchema>;
export type BankProfileDraftData = z.infer<typeof bankProfileDraftSchema>;
export type CalculationOptionsData = z.infer<typeof calculationOptionsSchema>;
export type CalculationSnapshotData = z.infer<typeof calculationSnapshotSchema>;
export type PurchaseStatusData = z.infer<typeof purchaseStatusSchema>;
export type StatusChangeData = z.infer<typeof statusChangeSchema>;
export type PurchaseExecutionData = z.infer<typeof purchaseExecutionSchema>;
export type PurchaseRecordData = z.infer<typeof purchaseRecordSchema>;
export type PurchaseFiltersData = z.infer<typeof purchaseFiltersSchema>;
export type DisclaimerData = z.infer<typeof disclaimerSchema>;
export type PersistedStateData = z.infer<typeof persistedStateSchema>;
export type PurchasesExportData = z.infer<typeof purchasesExportSchema>;
export type ConfigExportData = z.infer<typeof configExportSchema>;
