import type { PersistedState, PurchaseRecord } from '../domain/types';
import {
  configExportSchema,
  formatZodIssues,
  normalizePurchasesPayload,
  purchaseRecordSchema,
  purchasesExportSchema,
  withLegacyAccreditationDefaults,
} from '../domain/validation';

const SCHEMA_VERSION = 1;

export type ImportResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

const legacyPurchaseCsvColumns = [
  'id',
  'createdAt',
  'profileId',
  'profileName',
  'mode',
  'inputAmount',
  'amountBs',
  'bcvRate',
  'binanceRate',
  'usdBought',
  'usdForBinance',
  'usdDeposited',
  'totalCostBs',
  'estimatedBsOut',
  'estimatedProfitBs',
  'estimatedRoiPct',
  'breakEvenRate',
  'status',
  'notes',
  'execution',
  'statusHistory',
  'snapshot',
] as const;

const accreditationCsvColumns = [
  'requestedInvestmentVes',
  'requestedUsd',
  'accreditationType',
  'accreditedUsd',
  'accreditationRatePercent',
  'executedInvestmentVes',
  'refundedVes',
  'accreditationConfirmedAt',
] as const;

const purchaseCsvColumns = [
  ...legacyPurchaseCsvColumns,
  ...accreditationCsvColumns,
] as const;

const historicalCsvColumns = [
  'purchaseDate',
  'rateReference',
] as const;

const currentPurchaseCsvColumns = [
  ...purchaseCsvColumns,
  ...historicalCsvColumns,
] as const;

type PurchaseCsvColumn = (typeof currentPurchaseCsvColumns)[number];

interface CsvRow {
  fields: string[];
  line: number;
}

interface CsvParseResult {
  rows: CsvRow[];
  error?: string;
}

function jsonError(): ImportResult<never> {
  return { ok: false, errors: ['El archivo no contiene un JSON válido.'] };
}

function formatPurchaseExportIssues(error: Parameters<typeof formatZodIssues>[0]): string[] {
  return error.issues.map((issue) => {
    const purchaseIndex =
      issue.path[0] === 'purchases' && typeof issue.path[1] === 'number'
        ? issue.path[1]
        : null;
    if (purchaseIndex !== null) {
      const field = issue.path.slice(2).map(String).join('.');
      return `Registro ${purchaseIndex + 1}${field ? ` (${field})` : ''}: ${issue.message}`;
    }

    const path = issue.path.map(String).join('.');
    return `${path ? `${path}: ` : ''}${issue.message}`;
  });
}

function validatePurchaseArray(records: unknown[]): ImportResult<PurchaseRecord[]> {
  const purchases: PurchaseRecord[] = [];
  const errors: string[] = [];

  records.forEach((record, index) => {
    const parsed = purchaseRecordSchema.safeParse(
      withLegacyAccreditationDefaults(record),
    );
    if (parsed.success) {
      purchases.push(parsed.data);
      return;
    }

    errors.push(`Registro ${index + 1}: ${formatZodIssues(parsed.error).join('; ')}`);
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: purchases };
}

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsvRows(text: string): CsvParseResult {
  const rows: CsvRow[] = [];
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let line = 1;
  let rowLine = 1;
  let atLineStart = true;

  const finishRow = (): void => {
    fields.push(field);
    rows.push({ fields: [...fields], line: rowLine });
    fields.length = 0;
    field = '';
    afterQuote = false;
  };

  for (let index = 0; index < text.length; ) {
    const character = text[index];

    if (!inQuotes && atLineStart && character === '#') {
      while (index < text.length && text[index] !== '\r' && text[index] !== '\n') index += 1;
      if (index < text.length) {
        const lineBreakLength =
          text[index] === '\r' && text[index + 1] === '\n' ? 2 : 1;
        index += lineBreakLength;
        line += 1;
        rowLine = line;
        atLineStart = true;
      }
      continue;
    }

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          atLineStart = false;
          continue;
        }

        inQuotes = false;
        afterQuote = true;
        index += 1;
        atLineStart = false;
        continue;
      }

      if (character === '\r' || character === '\n') {
        const lineBreakLength =
          character === '\r' && text[index + 1] === '\n' ? 2 : 1;
        field += text.slice(index, index + lineBreakLength);
        index += lineBreakLength;
        line += 1;
        atLineStart = true;
        continue;
      }

      field += character;
      index += 1;
      atLineStart = false;
      continue;
    }

    if (afterQuote) {
      if (character === ',') {
        fields.push(field);
        field = '';
        afterQuote = false;
        index += 1;
        atLineStart = false;
        continue;
      }

      if (character !== '\r' && character !== '\n') {
        return { rows: [], error: `Fila ${rowLine}: hay texto después de un campo entre comillas.` };
      }
    }

    if (character === '"') {
      if (field.length > 0) {
        return { rows: [], error: `Fila ${rowLine}: comilla inesperada en un campo sin comillas.` };
      }
      inQuotes = true;
      index += 1;
      atLineStart = false;
      continue;
    }

    if (character === ',') {
      fields.push(field);
      field = '';
      index += 1;
      atLineStart = false;
      continue;
    }

    if (character === '\r' || character === '\n') {
      finishRow();
      const lineBreakLength =
        character === '\r' && text[index + 1] === '\n' ? 2 : 1;
      index += lineBreakLength;
      line += 1;
      rowLine = line;
      atLineStart = true;
      continue;
    }

    field += character;
    index += 1;
    atLineStart = false;
  }

  if (inQuotes) {
    return { rows: [], error: `Fila ${rowLine}: hay un campo entre comillas sin cerrar.` };
  }

  if (fields.length > 0 || field.length > 0 || afterQuote) finishRow();

  return { rows };
}

function parseJsonColumn(value: string, column: PurchaseCsvColumn, rowLine: number): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Fila ${rowLine}: la columna ${column} no contiene JSON válido.`);
  }
}

function csvNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

function parseCsvPurchase(
  fields: string[],
  rowLine: number,
  columns: readonly PurchaseCsvColumn[],
): unknown {
  const values = Object.fromEntries(
    columns.map((column, index) => [column, fields[index]]),
  ) as Record<string, string>;
  const execution =
    values.execution === ''
      ? null
      : parseJsonColumn(values.execution, 'execution', rowLine);
  const candidate: Record<string, unknown> = {
    id: values.id,
    createdAt: values.createdAt,
    profileId: values.profileId,
    profileName: values.profileName,
    mode: values.mode,
    inputAmount: csvNumber(values.inputAmount),
    amountBs: csvNumber(values.amountBs),
    bcvRate: csvNumber(values.bcvRate),
    binanceRate: csvNumber(values.binanceRate),
    usdBought: csvNumber(values.usdBought),
    usdForBinance: csvNumber(values.usdForBinance),
    usdDeposited: csvNumber(values.usdDeposited),
    totalCostBs: csvNumber(values.totalCostBs),
    estimatedBsOut: csvNumber(values.estimatedBsOut),
    estimatedProfitBs: csvNumber(values.estimatedProfitBs),
    estimatedRoiPct: csvNumber(values.estimatedRoiPct),
    breakEvenRate: csvNumber(values.breakEvenRate),
    status: values.status,
    notes: values.notes,
    execution,
    statusHistory: parseJsonColumn(values.statusHistory, 'statusHistory', rowLine),
    snapshot: parseJsonColumn(values.snapshot, 'snapshot', rowLine),
  };

  if (values.requestedInvestmentVes !== undefined) {
    candidate.requestedInvestmentVes = csvNumber(values.requestedInvestmentVes);
    candidate.requestedUsd = csvNumber(values.requestedUsd);
    candidate.accreditationType = values.accreditationType;
    candidate.accreditedUsd = csvNumber(values.accreditedUsd);
    candidate.accreditationRatePercent = csvNumber(values.accreditationRatePercent);
    candidate.executedInvestmentVes = csvNumber(values.executedInvestmentVes);
    candidate.refundedVes = csvNumber(values.refundedVes);
    candidate.accreditationConfirmedAt =
      values.accreditationConfirmedAt === '' ? null : values.accreditationConfirmedAt;
  }

  if (values.purchaseDate !== undefined && values.purchaseDate.trim() !== '') {
    candidate.purchaseDate = values.purchaseDate;
  }
  if (values.rateReference !== undefined && values.rateReference.trim() !== '') {
    candidate.rateReference = parseJsonColumn(
      values.rateReference,
      'rateReference',
      rowLine,
    );
  }

  return candidate;
}

export function createPurchasesJsonExport(purchases: PurchaseRecord[]): string {
  return JSON.stringify(
    { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), purchases },
    null,
    2,
  );
}

export function parsePurchasesJson(text: string): ImportResult<PurchaseRecord[]> {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return jsonError();
  }

  if (Array.isArray(payload)) return validatePurchaseArray(payload);

  const parsed = purchasesExportSchema.safeParse(normalizePurchasesPayload(payload));
  if (!parsed.success) {
    return { ok: false, errors: formatPurchaseExportIssues(parsed.error) };
  }

  return { ok: true, data: parsed.data.purchases };
}

export function createPurchasesCsvExport(purchases: PurchaseRecord[]): string {
  const header = currentPurchaseCsvColumns.join(',');
  const rows = purchases.map((purchase) => {
    const values: Record<PurchaseCsvColumn, string> = {
      id: purchase.id,
      createdAt: purchase.createdAt,
      profileId: purchase.profileId,
      profileName: purchase.profileName,
      mode: purchase.mode,
      inputAmount: String(purchase.inputAmount),
      amountBs: String(purchase.amountBs),
      bcvRate: String(purchase.bcvRate),
      binanceRate: String(purchase.binanceRate),
      usdBought: String(purchase.usdBought),
      usdForBinance: String(purchase.usdForBinance),
      usdDeposited: String(purchase.usdDeposited),
      totalCostBs: String(purchase.totalCostBs),
      estimatedBsOut: String(purchase.estimatedBsOut),
      estimatedProfitBs: String(purchase.estimatedProfitBs),
      estimatedRoiPct: String(purchase.estimatedRoiPct),
      breakEvenRate: String(purchase.breakEvenRate),
      status: purchase.status,
      notes: purchase.notes,
      execution: purchase.execution === null ? '' : JSON.stringify(purchase.execution),
      statusHistory: JSON.stringify(purchase.statusHistory),
      snapshot: JSON.stringify(purchase.snapshot),
      requestedInvestmentVes: String(purchase.requestedInvestmentVes),
      requestedUsd: String(purchase.requestedUsd),
      accreditationType: purchase.accreditationType,
      accreditedUsd: String(purchase.accreditedUsd),
      accreditationRatePercent: String(purchase.accreditationRatePercent),
      executedInvestmentVes: String(purchase.executedInvestmentVes),
      refundedVes: String(purchase.refundedVes),
      accreditationConfirmedAt: purchase.accreditationConfirmedAt ?? '',
      purchaseDate: purchase.purchaseDate ?? '',
      rateReference: purchase.rateReference
        ? JSON.stringify(purchase.rateReference)
        : '',
    };

    return currentPurchaseCsvColumns.map((column) => escapeCsvField(values[column])).join(',');
  });

  return ['# schemaVersion=1', header, ...rows].join('\r\n');
}

export function parsePurchasesCsv(text: string): ImportResult<PurchaseRecord[]> {
  const withoutBom = text.replace(/^\uFEFF/, '');
  const csv = parseCsvRows(withoutBom);
  if (csv.error) return { ok: false, errors: [csv.error] };

  const rows = csv.rows.filter(
    (row) => !(row.fields.length === 1 && row.fields[0].trim() === ''),
  );
  const header = rows[0];
  if (!header) return { ok: false, errors: ['El archivo CSV está vacío o no contiene encabezado.'] };

  const hasLegacyHeader =
    header.fields.length === legacyPurchaseCsvColumns.length &&
    legacyPurchaseCsvColumns.every((column, index) => header.fields[index] === column);
  const hasCurrentHeader =
    header.fields.length === purchaseCsvColumns.length &&
    purchaseCsvColumns.every((column, index) => header.fields[index] === column);
  const hasHistoricalHeader =
    header.fields.length === currentPurchaseCsvColumns.length &&
    currentPurchaseCsvColumns.every((column, index) => header.fields[index] === column);
  if (!hasLegacyHeader && !hasCurrentHeader && !hasHistoricalHeader) {
    return { ok: false, errors: [`Fila ${header.line}: el encabezado CSV no es válido.`] };
  }

  const columns = hasHistoricalHeader
    ? currentPurchaseCsvColumns
    : hasCurrentHeader
      ? purchaseCsvColumns
      : legacyPurchaseCsvColumns;
  const purchases: PurchaseRecord[] = [];
  const errors: string[] = [];

  for (const row of rows.slice(1)) {
    if (row.fields.length !== columns.length) {
      errors.push(
        `Fila ${row.line}: se esperaban ${columns.length} columnas y se encontraron ${row.fields.length}.`,
      );
      continue;
    }

    let candidate: unknown;
    try {
      candidate = parseCsvPurchase(row.fields, row.line, columns);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Fila ${row.line}: error al leer la fila.`);
      continue;
    }

    const parsed = purchaseRecordSchema.safeParse(
      withLegacyAccreditationDefaults(candidate),
    );
    if (!parsed.success) {
      errors.push(`Fila ${row.line}: ${formatZodIssues(parsed.error).join('; ')}`);
      continue;
    }

    purchases.push(parsed.data);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: purchases };
}

export function createConfigJsonExport(config: PersistedState): string {
  return JSON.stringify(
    { ...config, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() },
    null,
    2,
  );
}

export function parseConfigJson(text: string): ImportResult<PersistedState> {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return jsonError();
  }

  const parsed = configExportSchema.safeParse(normalizePurchasesPayload(payload));
  if (!parsed.success) {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'schemaVersion' in payload &&
      (payload as { schemaVersion?: unknown }).schemaVersion !== SCHEMA_VERSION
    ) {
      return {
        ok: false,
        errors: [`La versión del esquema no es compatible; se requiere la versión ${SCHEMA_VERSION}.`],
      };
    }

    return { ok: false, errors: formatZodIssues(parsed.error) };
  }

  if (parsed.data.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`La versión del esquema no es compatible; se requiere la versión ${SCHEMA_VERSION}.`],
    };
  }

  const { exportedAt: _exportedAt, ...config } = parsed.data;
  return { ok: true, data: config };
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  if (
    typeof document === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new Error('La descarga solo está disponible en el navegador.');
  }

  const objectUrl = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;

  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}
