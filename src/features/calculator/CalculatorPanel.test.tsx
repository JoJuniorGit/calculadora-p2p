/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankProfile } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { formatDateOnly } from '../../utils/format';
import { AUTO_RATE_REFRESH_DEBOUNCE_MS } from '../rates/useAutoRateRefresh';
import {
  BANK_PROFILE_STORAGE_KEY,
  CALCULATION_MODE_STORAGE_KEY,
  CalculatorPanel,
} from './CalculatorPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

const timestamp = '2024-01-02T12:00:00.000Z';

const profile: BankProfile = {
  id: 'profile-1',
  name: 'Banco Test',
  cardCommissionPct: 2,
  cardCommissionBase: 'usd',
  binanceDepositPct: 1,
  binanceDepositFixedUsd: 0.5,
  interbankEnabled: false,
  interbankPct: 0.3,
  interbankBase: 'initial',
  igtfEnabled: false,
  igtfPct: 3,
  igtfBase: 'card',
  slippageEnabled: false,
  slippagePct: 2,
  notes: '',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const secondProfile: BankProfile = {
  ...profile,
  id: 'profile-2',
  name: 'Banco Test Alternativo',
  interbankEnabled: true,
  igtfEnabled: true,
  slippageEnabled: true,
};

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    rates: {
      bcv: { value: 40, updatedAt: null, source: 'manual' },
      binance: { value: 46, updatedAt: null, source: 'manual' },
    },
    profiles: [profile],
    purchases: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
    disclaimer: { text: 'Aviso de prueba.', hasSeen: true },
    theme: 'light',
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<CalculatorPanel />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function getLocalDateStamp(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function clickButton(text: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function renderFreshWithProfiles(profiles: BankProfile[]): void {
  act(() => {
    root?.unmount();
  });
  container.remove();
  useAppStore.setState({ profiles });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<CalculatorPanel />);
  });
}

function selectProfile(profileId: string): void {
  const profileSelect = container.querySelector<HTMLSelectElement>(
    'select[name="calculator-profile"]',
  );
  expect(profileSelect).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  )?.set;
  act(() => {
    setter?.call(profileSelect as HTMLSelectElement, profileId);
    profileSelect?.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('CalculatorPanel bank profile priority', () => {
  it('renders the purchase date field after the amount field', () => {
    const amountInput = container.querySelector(
      'input[name="calculator-amount"]',
    );
    const dateInput = container.querySelector(
      'input[name="calculator-purchase-date"]',
    );

    expect(amountInput).not.toBeNull();
    expect(dateInput).not.toBeNull();
    expect(
      (amountInput as HTMLInputElement).compareDocumentPosition(
        dateInput as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('restores the last selected bank profile on a fresh render', () => {
    localStorage.setItem(BANK_PROFILE_STORAGE_KEY, secondProfile.id);
    renderFreshWithProfiles([profile, secondProfile]);

    const profileSelect = container.querySelector<HTMLSelectElement>(
      'select[name="calculator-profile"]',
    );
    const interbankOption = [...container.querySelectorAll('button[aria-pressed="true"]')].find(
      (button) => button.textContent?.includes('Interbancario'),
    );

    expect(profileSelect?.value).toBe(secondProfile.id);
    expect(interbankOption).toBeTruthy();
  });

  it('persists the profile selected by the user', () => {
    renderFreshWithProfiles([profile, secondProfile]);
    selectProfile(secondProfile.id);

    expect(localStorage.getItem(BANK_PROFILE_STORAGE_KEY)).toBe(secondProfile.id);
  });

  it('falls back to the first profile when the stored profile no longer exists', () => {
    localStorage.setItem(BANK_PROFILE_STORAGE_KEY, 'deleted-profile');
    renderFreshWithProfiles([profile, secondProfile]);

    const profileSelect = container.querySelector<HTMLSelectElement>(
      'select[name="calculator-profile"]',
    );

    expect(profileSelect?.value).toBe(profile.id);
    expect(localStorage.getItem(BANK_PROFILE_STORAGE_KEY)).toBe(profile.id);
  });

  it('renders profiles in store order while keeping the remembered profile selected', () => {
    localStorage.setItem(BANK_PROFILE_STORAGE_KEY, secondProfile.id);
    renderFreshWithProfiles([secondProfile, profile]);

    const profileSelect = container.querySelector<HTMLSelectElement>(
      'select[name="calculator-profile"]',
    );

    expect(
      [...(profileSelect?.options ?? [])].map((option) => option.value),
    ).toEqual([secondProfile.id, profile.id]);
    expect(profileSelect?.value).toBe(secondProfile.id);
  });

  it('places the bank profile before the amount field and explains its role', () => {
    const profileSelect = container.querySelector('select[name="calculator-profile"]');
    const amountInput = container.querySelector('input[name="calculator-amount"]');

    expect(profileSelect).not.toBeNull();
    expect(amountInput).not.toBeNull();
    expect(
      (profileSelect as Element).compareDocumentPosition(amountInput as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.textContent).toContain(
      'Los costos y comisiones de esta operación se toman de este perfil.',
    );
  });

  it('offers a copy action for the investment value', () => {
    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copiar inversión en Bs.S"]',
    );

    expect(copyButton).not.toBeNull();
    expect(copyButton?.disabled).toBe(true);
    expect(copyButton?.getAttribute('title')).toBe('Copiar inversión en Bs.S');
  });

  it('places the mobile summary between the amount field and the rates', () => {
    const amountInput = container.querySelector('input[name="calculator-amount"]');
    const mobileSummary = container.querySelector('[data-testid="mobile-hero-summary"]');
    const rates = container.querySelector('dl[aria-label="Tasas actuales"]');

    expect(amountInput).not.toBeNull();
    expect(mobileSummary).not.toBeNull();
    expect(rates).not.toBeNull();
    expect(
      (amountInput as Element).compareDocumentPosition(mobileSummary as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (mobileSummary as Element).compareDocumentPosition(rates as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mobileSummary?.textContent).toContain('Inversión');
    expect(mobileSummary?.textContent).toContain('Retorno');
    expect(mobileSummary?.textContent).toContain('USD Adjudicados');
    expect(mobileSummary?.textContent).toContain('Monto a Ingresar en Binance');
    expect(mobileSummary?.textContent).toContain('Sin monto');
    expect(mobileSummary?.textContent).toContain('Rojo ≤ 0%');
  });

  it('restores the last calculation mode and persists changes', () => {
    const usdButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Solicitar USD',
    );
    expect(usdButton).toBeTruthy();

    act(() => {
      usdButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(localStorage.getItem(CALCULATION_MODE_STORAGE_KEY)).toBe('usd');
    expect(usdButton?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      root?.unmount();
    });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(<CalculatorPanel />);
    });

    const restoredUsdButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Solicitar USD',
    );
    const bsButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Invertir Bs.S',
    );
    expect(restoredUsdButton?.getAttribute('aria-pressed')).toBe('true');
    expect(bsButton?.getAttribute('aria-pressed')).toBe('false');
  });

  it('asks for confirmation before registering a purchase', () => {
    const amountInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-amount"]',
    );
    expect(amountInput).not.toBeNull();
    setInputValue(amountInput as HTMLInputElement, '100000');

    clickButton('Registrar compra');

    expect(container.textContent).toContain('Confirmar registro de compra');
    expect(container.textContent).toContain('Monto ingresado');
    expect(useAppStore.getState().purchases).toHaveLength(0);

    clickButton('Confirmar compra');

    expect(useAppStore.getState().purchases).toHaveLength(1);
    expect(useAppStore.getState().purchases[0].amountBs).toBe(1_000);
  });

  it('uses historical rates for a past purchase without mutating the live rates', async () => {
    const pastDate = new Date();
    pastDate.setHours(12, 0, 0, 0);
    pastDate.setDate(pastDate.getDate() - 1);
    const purchaseDate = getLocalDateStamp(pastDate);
    const p2pTimestamp = new Date(
      pastDate.getFullYear(),
      pastDate.getMonth(),
      pastDate.getDate(),
      12,
    ).toISOString();
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/history/binance')
          ? jsonResponse({
              currencies: [{ date: p2pTimestamp, median_price: 70 }],
            })
          : jsonResponse([{ fecha: purchaseDate, promedio: 50 }]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const liveRatesBefore = useAppStore.getState().rates;
    const dateInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-purchase-date"]',
    );
    expect(dateInput).not.toBeNull();

    setInputValue(dateInput as HTMLInputElement, purchaseDate);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Referencia diaria');
    expect(container.textContent).toContain('50,00 Bs.S/USD');
    expect(container.textContent).toContain('70,00 Bs.S/USD');

    const amountInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-amount"]',
    );
    setInputValue(amountInput as HTMLInputElement, '100000');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    clickButton('Registrar compra');

    expect(container.textContent).toContain(formatDateOnly(purchaseDate));
    expect(container.textContent).toContain('Fuente de tasas');
    expect(container.textContent).toContain('Histórica');
    clickButton('Confirmar compra');

    expect(useAppStore.getState().purchases[0]).toMatchObject({
      purchaseDate,
      bcvRate: 50,
      binanceRate: 70,
      rateReference: {
        source: 'historical',
        bcvAsOf: `${purchaseDate}T00:00:00.000Z`,
        bcvForwardFilled: false,
        binanceAsOf: p2pTimestamp,
        binanceMethod: 'median',
      },
    });
    expect(useAppStore.getState().rates).toEqual(liveRatesBefore);
  });

  it('requires manual rates after a failed lookup instead of falling back to live rates', async () => {
    const pastDate = new Date();
    pastDate.setHours(12, 0, 0, 0);
    pastDate.setDate(pastDate.getDate() - 2);
    const purchaseDate = getLocalDateStamp(pastDate);
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    const liveRatesBefore = useAppStore.getState().rates;
    const dateInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-purchase-date"]',
    );
    expect(dateInput).not.toBeNull();

    setInputValue(dateInput as HTMLInputElement, purchaseDate);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('No se usarán las tasas actuales');
    const rateSummary = container.querySelector(
      'dl[aria-label="Tasas aplicadas para la fecha de compra"]',
    );
    expect(rateSummary?.textContent).toContain('Sin configurar');
    expect(
      container.querySelector('input[name="calculator-bcv-rate"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('input[name="calculator-binance-rate"]'),
    ).not.toBeNull();
    const registerButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Registrar compra',
    );
    expect(registerButton?.disabled).toBe(true);

    const bcvInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-bcv-rate"]',
    );
    const binanceInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-binance-rate"]',
    );
    const amountInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-amount"]',
    );
    setInputValue(bcvInput as HTMLInputElement, '500000');
    setInputValue(binanceInput as HTMLInputElement, '700000');
    setInputValue(amountInput as HTMLInputElement, '100000');
    expect(rateSummary?.textContent).toContain('50,00 Bs.S/USD');
    expect(rateSummary?.textContent).toContain('70,00 Bs.S/USD');

    clickButton('Registrar compra');
    expect(container.textContent).toContain('Manual');
    clickButton('Confirmar compra');

    expect(useAppStore.getState().purchases[0]).toMatchObject({
      purchaseDate,
      bcvRate: 50,
      binanceRate: 70,
      rateReference: {
        source: 'manual',
        bcvAsOf: purchaseDate,
        bcvForwardFilled: false,
        binanceAsOf: null,
        binanceMethod: 'manual',
      },
    });
    expect(useAppStore.getState().rates).toEqual(liveRatesBefore);
  });

  it('auto-updates missing rates when the user enters an amount', async () => {
    act(() => {
      useAppStore.setState({
        rates: {
          bcv: { value: 0, updatedAt: null, source: 'manual' },
          binance: { value: 0, updatedAt: null, source: 'manual' },
        },
      });
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/binance-api/bapi/c2c/v2/friendly/c2c/adv/search') {
        return Promise.resolve(
          jsonResponse({ data: [{ adv: { price: '46.00' } }] }),
        );
      }
      return Promise.resolve(
        jsonResponse([
          { fuente: 'oficial', promedio: 40 },
          { fuente: 'paralelo', promedio: 46 },
        ]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const amountInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-amount"]',
    );
    expect(amountInput).not.toBeNull();
    setInputValue(amountInput as HTMLInputElement, '100');

    await act(async () => {
      await new Promise((resolve) =>
        window.setTimeout(resolve, AUTO_RATE_REFRESH_DEBOUNCE_MS + 100),
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().rates.bcv).toMatchObject({
      value: 40,
      source: 'auto',
    });
    expect(useAppStore.getState().rates.binance).toMatchObject({
      value: 46,
      source: 'auto',
    });
    expect(container.textContent).toContain('Tasas actualizadas automáticamente.');
  });

  it('does not refresh manually configured rates when the user enters an amount', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const amountInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-amount"]',
    );
    expect(amountInput).not.toBeNull();
    setInputValue(amountInput as HTMLInputElement, '100');

    await act(async () => {
      await new Promise((resolve) =>
        window.setTimeout(resolve, AUTO_RATE_REFRESH_DEBOUNCE_MS + 100),
      );
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().rates.bcv).toMatchObject({
      value: 40,
      source: 'manual',
    });
    expect(useAppStore.getState().rates.binance).toMatchObject({
      value: 46,
      source: 'manual',
    });
  });

  it('marks a fetched rate as manual when the user edits it', async () => {
    const pastDate = new Date();
    pastDate.setHours(12, 0, 0, 0);
    pastDate.setDate(pastDate.getDate() - 1);
    const purchaseDate = getLocalDateStamp(pastDate);
    const p2pTimestamp = new Date(
      pastDate.getFullYear(),
      pastDate.getMonth(),
      pastDate.getDate(),
      12,
    ).toISOString();
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/history/binance')
          ? jsonResponse({
              currencies: [{ date: p2pTimestamp, median_price: 70 }],
            })
          : jsonResponse([{ fecha: purchaseDate, promedio: 50 }]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const dateInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-purchase-date"]',
    );
    setInputValue(dateInput as HTMLInputElement, purchaseDate);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const bcvInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-bcv-rate"]',
    );
    const amountInput = container.querySelector<HTMLInputElement>(
      'input[name="calculator-amount"]',
    );
    setInputValue(bcvInput as HTMLInputElement, '510000');
    setInputValue(amountInput as HTMLInputElement, '100000');
    clickButton('Registrar compra');
    expect(container.textContent).toContain('Fuente aplicada: Manual');
    clickButton('Confirmar compra');

    expect(useAppStore.getState().purchases[0]).toMatchObject({
      purchaseDate,
      bcvRate: 51,
      binanceRate: 70,
      rateReference: {
        source: 'manual',
        bcvAsOf: purchaseDate,
        bcvForwardFilled: false,
        binanceAsOf: p2pTimestamp,
        binanceMethod: 'median',
      },
    });
  });
});

