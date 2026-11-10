import { useId, useState, type FormEvent } from 'react';
import type {
  BankProfile,
  BankProfileDraft,
  CommissionBase,
  InterbankBase,
  IgtfBase,
} from '../../domain/types';
import { bankProfileDraftSchema, formatZodIssues } from '../../domain/validation';
import { toInputNumber } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { NumberField } from '../../components/ui/NumberField';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { ToggleField } from '../../components/ui/ToggleField';
import fields from '../../components/ui/fields.module.css';
import styles from './BankProfileForm.module.css';

interface ProfileFormValues {
  name: string;
  cardCommissionPct: string;
  cardCommissionBase: CommissionBase;
  binanceDepositPct: string;
  binanceDepositFixedUsd: string;
  interbankEnabled: boolean;
  interbankPct: string;
  interbankBase: InterbankBase;
  igtfEnabled: boolean;
  igtfPct: string;
  igtfBase: IgtfBase;
  slippageEnabled: boolean;
  slippagePct: string;
  notes: string;
}

const fieldLabels: Record<keyof ProfileFormValues, string> = {
  name: 'Nombre del banco',
  cardCommissionPct: 'Comisión de tarjeta',
  cardCommissionBase: 'Base de la comisión de tarjeta',
  binanceDepositPct: 'Comisión porcentual de depósito Binance',
  binanceDepositFixedUsd: 'Monto fijo de depósito Binance',
  interbankEnabled: 'Pago interbancario',
  interbankPct: 'Comisión interbancaria',
  interbankBase: 'Base interbancaria',
  igtfEnabled: 'IGTF',
  igtfPct: 'Comisión IGTF',
  igtfBase: 'Base del IGTF',
  slippageEnabled: 'Slippage',
  slippagePct: 'Slippage',
  notes: 'Notas',
};

function createInitialValues(profile?: BankProfile | null): ProfileFormValues {
  return {
    name: profile?.name ?? '',
    cardCommissionPct: profile ? toInputNumber(profile.cardCommissionPct) : '0',
    cardCommissionBase: profile?.cardCommissionBase ?? 'usd',
    binanceDepositPct: profile ? toInputNumber(profile.binanceDepositPct) : '0',
    binanceDepositFixedUsd: profile ? toInputNumber(profile.binanceDepositFixedUsd) : '0',
    interbankEnabled: profile?.interbankEnabled ?? false,
    interbankPct: profile ? toInputNumber(profile.interbankPct) : '0.30',
    interbankBase: profile?.interbankBase ?? 'initial',
    igtfEnabled: profile?.igtfEnabled ?? false,
    igtfPct: profile ? toInputNumber(profile.igtfPct) : '3',
    igtfBase: profile?.igtfBase ?? 'card',
    slippageEnabled: profile?.slippageEnabled ?? false,
    slippagePct: profile ? toInputNumber(profile.slippagePct) : '2',
    notes: profile?.notes ?? '',
  };
}

function parseDecimal(value: string): number {
  return Number(value.replace(',', '.'));
}

function isFormField(value: string): value is keyof ProfileFormValues {
  return Object.prototype.hasOwnProperty.call(fieldLabels, value);
}

export interface BankProfileFormProps {
  profile?: BankProfile | null;
  onSave(draft: BankProfileDraft): void;
  onCancel(): void;
}

export function BankProfileForm({ profile, onSave, onCancel }: BankProfileFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(() => createInitialValues(profile));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileFormValues, string>>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const notesId = useId();
  const notesErrorId = `${notesId}-error`;

  const updateValue = <Key extends keyof ProfileFormValues>(
    field: Key,
    value: ProfileFormValues[Key],
  ): void => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSummary([]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const draft: BankProfileDraft = {
      name: values.name,
      cardCommissionPct: parseDecimal(values.cardCommissionPct),
      cardCommissionBase: values.cardCommissionBase,
      binanceDepositPct: parseDecimal(values.binanceDepositPct),
      binanceDepositFixedUsd: parseDecimal(values.binanceDepositFixedUsd),
      interbankEnabled: values.interbankEnabled,
      interbankPct: parseDecimal(values.interbankPct),
      interbankBase: values.interbankBase,
      igtfEnabled: values.igtfEnabled,
      igtfPct: parseDecimal(values.igtfPct),
      igtfBase: values.igtfBase,
      slippageEnabled: values.slippageEnabled,
      slippagePct: parseDecimal(values.slippagePct),
      notes: values.notes,
    };
    const parsed = bankProfileDraftSchema.safeParse(draft);

    if (!parsed.success) {
      const nextFieldErrors: Partial<Record<keyof ProfileFormValues, string>> = {};
      const nextSummary = formatZodIssues(parsed.error).map((issue) => {
        const separator = issue.indexOf(': ');
        const path = separator < 0 ? 'general' : issue.slice(0, separator);
        const message = separator < 0 ? issue : issue.slice(separator + 2);

        if (!isFormField(path)) return message;
        nextFieldErrors[path] ??= message;
        return `${fieldLabels[path]}: ${message}`;
      });

      setFieldErrors(nextFieldErrors);
      setSummary(nextSummary);
      return;
    }

    setFieldErrors({});
    setSummary([]);
    onSave(parsed.data);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {summary.length > 0 && (
        <div className={styles.summary} role="alert" aria-live="assertive">
          <strong>Revisa los siguientes campos:</strong>
          <ul>
            {summary.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <TextField
        label="Nombre del banco"
        name="name"
        value={values.name}
        onChange={(value) => updateValue('name', value)}
        error={fieldErrors.name}
        placeholder="Ej.: Banco Nacional"
      />

      <fieldset className={styles.group}>
        <legend>Comisión de tarjeta</legend>
        <div className={styles.groupGrid}>
          <NumberField
            label="Comisión de tarjeta (%)"
            name="cardCommissionPct"
            value={values.cardCommissionPct}
            onChange={(value) => updateValue('cardCommissionPct', value)}
            error={fieldErrors.cardCommissionPct}
            suffix="%"
            step={0.01}
          />
          <SelectField
            label="Base de la comisión"
            name="cardCommissionBase"
            value={values.cardCommissionBase}
            onChange={(value) => updateValue('cardCommissionBase', value as CommissionBase)}
            options={[
              { value: 'usd', label: 'Descontado de los USD' },
              { value: 'ves', label: 'Cobrado extra en Bs.S' },
            ]}
            error={fieldErrors.cardCommissionBase}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Comisión de depósito Binance</legend>
        <div className={styles.groupGrid}>
          <NumberField
            label="Comisión porcentual (%)"
            name="binanceDepositPct"
            value={values.binanceDepositPct}
            onChange={(value) => updateValue('binanceDepositPct', value)}
            error={fieldErrors.binanceDepositPct}
            suffix="%"
            step={0.01}
          />
          <NumberField
            label="Monto fijo (USD)"
            name="binanceDepositFixedUsd"
            value={values.binanceDepositFixedUsd}
            onChange={(value) => updateValue('binanceDepositFixedUsd', value)}
            error={fieldErrors.binanceDepositFixedUsd}
            suffix="USD"
            step={0.01}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Pago interbancario</legend>
        <div className={styles.groupContent}>
          <ToggleField
            label="Aplicar pago interbancario"
            name="interbankEnabled"
            checked={values.interbankEnabled}
            onChange={(checked) => updateValue('interbankEnabled', checked)}
          />
          <div className={styles.groupGrid}>
            <NumberField
              label="Comisión interbancaria (%)"
              name="interbankPct"
              value={values.interbankPct}
              onChange={(value) => updateValue('interbankPct', value)}
              error={fieldErrors.interbankPct}
              suffix="%"
              step={0.01}
              disabled={!values.interbankEnabled}
            />
            <SelectField
              label="Base interbancaria"
              name="interbankBase"
              value={values.interbankBase}
              onChange={(value) => updateValue('interbankBase', value as InterbankBase)}
              options={[
                { value: 'initial', label: 'Sobre la inversión inicial' },
                { value: 'net', label: 'Sobre los Bs.S netos post-intervención' },
              ]}
              error={fieldErrors.interbankBase}
              disabled={!values.interbankEnabled}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>IGTF</legend>
        <div className={styles.groupContent}>
          <ToggleField
            label="Aplicar IGTF"
            name="igtfEnabled"
            checked={values.igtfEnabled}
            onChange={(checked) => updateValue('igtfEnabled', checked)}
          />
          <div className={styles.groupGrid}>
            <NumberField
              label="IGTF (%)"
              name="igtfPct"
              value={values.igtfPct}
              onChange={(value) => updateValue('igtfPct', value)}
              error={fieldErrors.igtfPct}
              suffix="%"
              step={0.01}
              disabled={!values.igtfEnabled}
            />
            <SelectField
              label="Base del IGTF"
              name="igtfBase"
              value={values.igtfBase}
              onChange={(value) => updateValue('igtfBase', value as IgtfBase)}
              options={[
                { value: 'card', label: 'Sobre el cargo de la tarjeta' },
                { value: 'investment', label: 'Sobre la inversión total en Bs.S' },
              ]}
              error={fieldErrors.igtfBase}
              disabled={!values.igtfEnabled}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Slippage</legend>
        <div className={styles.groupContent}>
          <ToggleField
            label="Aplicar slippage"
            name="slippageEnabled"
            checked={values.slippageEnabled}
            onChange={(checked) => updateValue('slippageEnabled', checked)}
          />
          <NumberField
            label="Slippage (%)"
            name="slippagePct"
            value={values.slippagePct}
            onChange={(value) => updateValue('slippagePct', value)}
            error={fieldErrors.slippagePct}
            suffix="%"
            step={0.01}
            disabled={!values.slippageEnabled}
          />
        </div>
      </fieldset>

      <div className={styles.notesField}>
        <label className={fields.label} htmlFor={notesId}>
          Notas
        </label>
        <textarea
          id={notesId}
          name="notes"
          className={fields.textarea}
          value={values.notes}
          onChange={(event) => updateValue('notes', event.currentTarget.value)}
          aria-invalid={fieldErrors.notes ? true : undefined}
          aria-describedby={fieldErrors.notes ? notesErrorId : undefined}
          placeholder="Información adicional del perfil"
        />
        {fieldErrors.notes && (
          <p id={notesErrorId} className={fields.error} role="alert">
            {fieldErrors.notes}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">Guardar perfil</Button>
      </div>
    </form>
  );
}
