import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Button } from './components/ui/Button';
import { PwaNotices } from './components/pwa/PwaNotices';
import {
  getExchangeGap,
  PROFITABILITY_GREEN_MIN_PCT,
  PROFITABILITY_YELLOW_MIN_PCT,
} from './domain/calculations';
import { BankProfilesPanel } from './features/bankProfiles/BankProfilesPanel';
import { CalculatorPanel } from './features/calculator/CalculatorPanel';
import { PurchasesPanel } from './features/purchases/PurchasesPanel';
import { RatesPanel } from './features/rates/RatesPanel';
import { useInitialRates } from './features/rates/useInitialRates';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { formatPct } from './utils/format';
import styles from './App.module.css';

type AppTab = 'rates' | 'profiles' | 'calculator' | 'records';

export const ACTIVE_TAB_STORAGE_KEY = 'calculadora-p2p:active-tab';

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'calculator', label: 'Calculadora' },
  { id: 'profiles', label: 'Perfiles' },
  { id: 'rates', label: 'Tasas' },
  { id: 'records', label: 'Registros' },
];

function isAppTab(value: string): value is AppTab {
  return tabs.some((tab) => tab.id === value);
}

function readStoredTab(): AppTab {
  try {
    if (typeof window === 'undefined') return 'calculator';
    const stored = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    return stored !== null && isAppTab(stored) ? stored : 'calculator';
  } catch {
    return 'calculator';
  }
}

function persistActiveTab(tab: AppTab): void {
  try {
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
  } catch {
    // Storage can be unavailable in private/full modes; the tab remains in memory.
  }
}

const tickerNumberFormatter = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatTickerRate(value: number): string {
  return Number.isFinite(value) && value > 0 ? tickerNumberFormatter.format(value) : '—';
}

function MoonIcon() {
  return (
    <svg
      className={styles.themeIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      className={styles.themeIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export default function App() {
  const theme = useAppStore((state) => state.theme);
  const disclaimer = useAppStore((state) => state.disclaimer);
  const rates = useAppStore((state) => state.rates);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const setDisclaimer = useAppStore((state) => state.setDisclaimer);
  const [activeTab, setActiveTab] = useState<AppTab>(readStoredTab);
  const [showDisclaimer, setShowDisclaimer] = useState(
    () => !useAppStore.getState().disclaimer.hasSeen,
  );
  useInitialRates();
  const ratesConfigured =
    Number.isFinite(rates.bcv.value) &&
    rates.bcv.value > 0 &&
    Number.isFinite(rates.binance.value) &&
    rates.binance.value > 0;
  const exchangeGap = useMemo(
    () => (ratesConfigured ? getExchangeGap(rates.bcv.value, rates.binance.value) : null),
    [rates.bcv.value, rates.binance.value, ratesConfigured],
  );
  const gapValueClassName =
    exchangeGap === null
      ? styles.tickerValueNeutral
      : exchangeGap.pct > PROFITABILITY_GREEN_MIN_PCT
        ? styles.tickerValueSuccess
        : exchangeGap.pct > PROFITABILITY_YELLOW_MIN_PCT
          ? styles.tickerValueWarning
          : styles.tickerValueDanger;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!useAppStore.getState().disclaimer.hasSeen) {
      setDisclaimer({ hasSeen: true });
    }
  }, [setDisclaimer]);

  useEffect(() => {
    persistActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey || event.ctrlKey || event.metaKey || document.querySelector('[role="dialog"]')) {
        return;
      }

      const tabIndex = Number(event.key) - 1;
      const tab = tabs[tabIndex];
      if (!tab) return;

      event.preventDefault();
      setActiveTab(tab.id);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <main className={styles.app}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">P2P</span>
            <div className={styles.brandCopy}>
              <h1>Calculadora P2P</h1>
              <p>Arbitraje USD/VES</p>
            </div>
          </div>

          <nav className={styles.tabs} aria-label="Navegación principal">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={styles.tab}
                type="button"
                aria-current={activeTab === tab.id ? 'page' : undefined}
                aria-keyshortcuts={`Alt+${tabs.indexOf(tab) + 1}`}
                data-shortcut={`Alt+${tabs.indexOf(tab) + 1}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              className={styles.themeToggle}
              onClick={toggleTheme}
              aria-label={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
              title={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
            >
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </Button>
          </div>
        </header>

        <div className={styles.ticker} role="group" aria-label="Tasas de referencia">
          <span className={styles.tickerItem}>
            <span className={styles.tickerLabel}>BCV:</span>
            <strong className={styles.tickerValue}>{formatTickerRate(rates.bcv.value)}</strong>
          </span>
          <span className={styles.tickerSeparator} aria-hidden="true">
            |
          </span>
          <span className={styles.tickerItem}>
            <span className={styles.tickerLabel}>P2P:</span>
            <strong className={styles.tickerValue}>{formatTickerRate(rates.binance.value)}</strong>
          </span>
          <span className={styles.tickerSeparator} aria-hidden="true">
            |
          </span>
          <span className={styles.tickerItem}>
            <span className={styles.tickerLabel}>Brecha:</span>
            <strong className={`${styles.tickerValue} ${gapValueClassName}`}>
              {exchangeGap ? formatPct(exchangeGap.pct, 2) : '-'}
            </strong>
          </span>
        </div>

        {showDisclaimer && (
          <aside className={styles.disclaimer} role="note">
            <p>{disclaimer.text}</p>
            <div className={styles.disclaimerActions}>
              <Button variant="secondary" onClick={() => setShowDisclaimer(false)}>
                Entendido
              </Button>
            </div>
          </aside>
        )}

        <div className={styles.content}>
          {activeTab === 'rates' && (
            <>
              <RatesPanel />
              <SettingsPanel />
            </>
          )}
          {activeTab === 'profiles' && <BankProfilesPanel />}
          {activeTab === 'calculator' && <CalculatorPanel />}
          {activeTab === 'records' && <PurchasesPanel />}
        </div>
      </div>
      <PwaNotices />
    </main>
  );
}
