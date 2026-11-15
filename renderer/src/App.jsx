import { useEffect, useState } from 'react';
import { Header } from './shell/Header.jsx';
import { NavigationProvider, useNavigation } from './shell/NavigationContext.jsx';
import { ShellProvider } from './shell/ShellContext.jsx';
import { TabBar } from './shell/TabBar.jsx';
import { UpdateBanner } from './shell/UpdateBanner.jsx';
import { VaultDialog } from './shell/VaultDialog.jsx';
import { useUpdates } from './shell/useUpdates.js';
import { I18nProvider, useI18n } from './i18n/I18nProvider.jsx';
import { MODULES } from './modules/index.js';
import { api } from './shared/api/api.js';
import { ThemeProvider } from './shared/context/ThemeContext.jsx';
import { FeedbackProvider, useFeedback } from './shared/ui/FeedbackProvider.jsx';

export function App() {
  return <I18nProvider>{window.csdraw ? <Providers /> : <Fatal />}</I18nProvider>;
}

function Fatal() {
  const { t } = useI18n();
  return (
    <div className="fatal">
      <h1>CsDraw</h1>
      <p>{t('app.needsElectron')}</p>
    </div>
  );
}

function Providers() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
        <ShellProvider>
          <NavigationProvider initialTab={MODULES[0].id}>
            <Shell />
          </NavigationProvider>
        </ShellProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const { activeTab, navigate } = useNavigation();
  const { t } = useI18n();
  const { notify, confirm } = useFeedback();
  const updates = useUpdates();
  const [vaultMode, setVaultMode] = useState(null);
  const [checking, setChecking] = useState(false);

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const state = await api.updates.check();
      if (state.status === 'disabled') notify(t('update.disabled'));
      else if (state.status === 'up-to-date') notify(t('update.upToDate', { version: state.currentVersion }));
      else if (state.status === 'error' && !state.version && await confirm({ title: t('update.failedTitle'), message: t('update.failedText'), confirmLabel: t('update.manual') })) {
        await api.updates.openReleases();
      }
    } catch {
      notify(t('update.failedTitle'));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const block = (event) => event.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => { window.removeEventListener('dragover', block); window.removeEventListener('drop', block); };
  }, []);

  return (
    <div className="app">
      <Header onOpenVault={setVaultMode} onCheckUpdates={checkUpdates} checkingUpdates={checking} version={updates?.currentVersion} />
      <TabBar modules={MODULES} activeTab={activeTab} onSelect={navigate} />
      <div className="modules">
        {MODULES.map(({ id, Component }) => (
          <section key={id} className="module" hidden={activeTab !== id}>
            <Component isActive={activeTab === id} />
          </section>
        ))}
      </div>
      <UpdateBanner updates={updates} />
      {vaultMode && <VaultDialog mode={vaultMode} onClose={() => setVaultMode(null)} />}
    </div>
  );
}
