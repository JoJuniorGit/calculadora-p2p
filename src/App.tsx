import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Button } from './components/ui/Button';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import {
  getExchangeGap,
  PROFITABILITY_GREEN_MIN_PCT,
  PROFITABILITY_YELLOW_MIN_PCT,
} from './domain/calculations';
import { BankProfilesPanel } from './features/bankProfiles/BankProfilesPanel';
import { CalculatorPanel } from './features/calculator/CalculatorPanel';
import { PurchasesPanel } from './features/purchases/PurchasesPanel';
import { RatesPanel } from './features/rates/RatesPanel';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { formatPct } from './utils/format';
import styles from './App.module.css';

type AppTab = 'rates' | 'profiles' | 'calculator' | 'records';

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'rates', label: 'Tasas' },
  { id: 'profiles', label: 'Perfiles' },
  { id: 'calculator', label: 'Calculadora' },
  { id: 'records', label: 'Registros' },
];

const tickerNumberFormatter = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatTickerRate(value: number): string {
  return Number.isFinite(value) && value > 0 ? tickerNumberFormatter.format(value) : '—';
}

export default function App() {
  const theme = useAppStore((state) => state.theme);
  const disclaimer = useAppStore((state) => state.disclaimer);
  const rates = useAppStore((state) => state.rates);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const loadDemoData = useAppStore((state) => state.loadDemoData);
  const [activeTab, setActiveTab] = useState<AppTab>('rates');
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
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

  const confirmDemoData = (): void => {
    loadDemoData();
    setDemoDialogOpen(false);
    setActiveTab('records');
  };

  return (
    <main className={styles.app}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <h1>Calculadora P2P</h1>
            <p>Arbitraje USD/VES</p>
          </div>
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={toggleTheme}>
              {theme === 'light' ? 'Tema oscuro' : 'Tema claro'}
            </Button>
            <Button variant="secondary" onClick={() => setDemoDialogOpen(true)}>
              Cargar datos demo
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
              {exchangeGap ? formatPct(exchangeGap.pct, 2) : '—'}
            </strong>
          </span>
        </div>

        {disclaimer.enabled && (
          <aside className={styles.disclaimer} role="note">
            {disclaimer.text}
          </aside>
        )}

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

      <ConfirmDialog
        open={demoDialogOpen}
        title="Cargar datos de demostración"
        message="Se agregarán un perfil de demostración y un registro completado si aún no existen, y se establecerán las tasas de demostración."
        confirmLabel="Cargar datos demo"
        onConfirm={confirmDemoData}
        onCancel={() => setDemoDialogOpen(false)}
      />
    </main>
  );
}
