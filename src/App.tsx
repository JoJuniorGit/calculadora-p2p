import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Button } from './components/ui/Button';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { BankProfilesPanel } from './features/bankProfiles/BankProfilesPanel';
import { CalculatorPanel } from './features/calculator/CalculatorPanel';
import { PurchasesPanel } from './features/purchases/PurchasesPanel';
import { RatesPanel } from './features/rates/RatesPanel';
import { SettingsPanel } from './features/settings/SettingsPanel';
import styles from './App.module.css';

type AppTab = 'rates' | 'profiles' | 'calculator' | 'records';

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'rates', label: 'Tasas' },
  { id: 'profiles', label: 'Perfiles' },
  { id: 'calculator', label: 'Calculadora' },
  { id: 'records', label: 'Registros' },
];

export default function App() {
  const theme = useAppStore((state) => state.theme);
  const disclaimer = useAppStore((state) => state.disclaimer);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const loadDemoData = useAppStore((state) => state.loadDemoData);
  const [activeTab, setActiveTab] = useState<AppTab>('rates');
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
