/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BankProfile } from '../../domain/types';
import { useAppStore } from '../../store/useAppStore';
import { BankProfilesPanel } from './BankProfilesPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2024-01-02T12:00:00.000Z';

function createProfile(id: string, name: string): BankProfile {
  return {
    id,
    name,
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
}

const first = createProfile('profile-1', 'Banco Uno');
const second = createProfile('profile-2', 'Banco Dos');

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    profiles: [first, second],
    purchases: [],
    sales: [],
    filters: { status: 'all', profileName: 'all', dateFrom: '', dateTo: '' },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<BankProfilesPanel />);
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container.remove();
  root = null;
});

describe('BankProfilesPanel ordering', () => {
  it('renders one accessible drag handle per profile', () => {
    const handles = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="Reordenar perfil"]',
    );

    expect(handles).toHaveLength(2);
    expect(handles[0]?.getAttribute('aria-label')).toBe('Reordenar perfil Banco Uno');
    expect(handles[1]?.getAttribute('aria-label')).toBe('Reordenar perfil Banco Dos');
    expect([...handles].every((handle) => handle.type === 'button')).toBe(true);
    expect(container.textContent).toContain(
      'Arrastrá desde el ícono de agarre para cambiar el orden del selector.',
    );
  });

  it('exposes the header help through an info tooltip', () => {
    const info = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Información sobre perfiles bancarios"]',
    );
    expect(info).not.toBeNull();

    const tooltip = document.getElementById(info?.getAttribute('aria-describedby') ?? '');
    expect(tooltip?.getAttribute('role')).toBe('tooltip');
    expect(tooltip?.textContent).toContain(
      'Configura las comisiones que se aplican a cada banco.',
    );
    expect(tooltip?.textContent).toContain(
      'Arrastrá desde el ícono de agarre para cambiar el orden del selector.',
    );
  });

  it('renders the list in store order and updates it after a move', () => {
    const profileIds = (): Array<string | null> =>
      [...container.querySelectorAll('[data-profile-id]')].map((element) =>
        element.getAttribute('data-profile-id'),
      );

    expect(profileIds()).toEqual([first.id, second.id]);

    act(() => {
      useAppStore.getState().moveProfile(second.id, first.id);
    });

    expect(profileIds()).toEqual([second.id, first.id]);
  });

  it('collapses profile details by default and toggles them', () => {
    const card = container.querySelector('[data-profile-id="profile-1"]');
    const toggle = [...(card?.querySelectorAll('button') ?? [])].find(
      (element) => element.textContent === 'Ver detalles',
    ) as HTMLButtonElement | undefined;

    expect(toggle).toBeTruthy();
    expect(toggle!.getAttribute('aria-expanded')).toBe('false');

    const details = document.getElementById(toggle!.getAttribute('aria-controls') ?? '');
    expect(details?.hidden).toBe(true);

    act(() => {
      toggle!.click();
    });

    expect(toggle!.getAttribute('aria-expanded')).toBe('true');
    expect(toggle!.textContent).toBe('Ocultar detalles');
    expect(details?.hidden).toBe(false);
  });

  it('renders profile actions below the notes', () => {
    const card = container.querySelector('[data-profile-id="profile-1"]');
    const toggle = [...(card?.querySelectorAll('button') ?? [])].find(
      (element) => element.textContent === 'Ver detalles',
    ) as HTMLButtonElement | undefined;

    act(() => {
      toggle?.click();
    });

    const notes = [...(card?.querySelectorAll('p') ?? [])].find(
      (element) => element.textContent === 'Sin notas.',
    );
    const editButton = [...(card?.querySelectorAll('button') ?? [])].find(
      (element) => element.textContent === 'Editar',
    );

    expect(notes).toBeTruthy();
    expect(editButton).toBeTruthy();
    expect(notes!.compareDocumentPosition(editButton!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
  });
});
