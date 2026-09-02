import { useState, useCallback, useEffect, useRef, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import { Home } from './routes/Home';
import { Player } from './routes/Player';
import { Editor } from './routes/Editor';
import { Layout } from './components/Layout';
import { basename, dirname } from './lib/pathUtils';
import { loadSession, saveSession } from './lib/sessionStorage';
import i18next from 'i18next';
import { localeService } from './services/LocaleService';
import { AccessibleDialog } from './components/AccessibleDialog';
import { BmsEditorI18nBridge, BmsPlayerI18nBridge } from './i18n/BmsLibI18nBridge';
import type { SupportedLocale } from '../shared/i18n/types';

export type AppRoute = 'home' | 'player' | 'editor';

export type NavigationGuard = () => {
  blocked: boolean;
  message: string;
  onSave?: () => Promise<boolean | void>;
};

// Error Boundary to catch rendering crashes
class ErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#f87171', background: '#1a1a2e', height: '100%', overflow: 'auto' }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>{i18next.t('app:errors.renderingTitle')}</h2>
          <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: '#fca5a5' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {i18next.t('app:errors.goHome')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface CurrentFile {
  path: string;
  name: string;
  folderPath: string;
}

export function App() {
  const { t } = useTranslation(['app', 'common']);
  // Restore last session
  const [route, setRoute] = useState<AppRoute>(() => {
    const session = loadSession();
    // Player/Editor need a file; a stale session without one would render a blank pane.
    if (!session?.lastFile) return 'home';
    return session.lastRoute || 'home';
  });
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(() => {
    const session = loadSession();
    return session?.lastFile || null;
  });
  const navigationGuardRef = useRef<NavigationGuard | null>(null);

  // Save session on route/file changes
  useEffect(() => {
    saveSession({ lastRoute: route, lastFile: currentFile });
  }, [route, currentFile]);
  const [navConfirm, setNavConfirm] = useState<{
    targetRoute: AppRoute;
    message: string;
    onSave?: () => Promise<boolean | void>;
  } | null>(null);

  const handleOpenFile = useCallback((file: CurrentFile) => {
    setCurrentFile(file);
  }, []);

  const handlePlay = useCallback(() => {
    if (currentFile) setRoute('player');
  }, [currentFile]);

  const handleEdit = useCallback(() => {
    if (currentFile) setRoute('editor');
  }, [currentFile]);

  const handleHome = useCallback(() => {
    setRoute('home');
  }, []);

  const handleClearFile = useCallback(() => {
    setCurrentFile(null);
  }, []);

  const registerNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    navigationGuardRef.current = guard;
  }, []);

  const handleNavigate = useCallback((targetRoute: AppRoute) => {
    if (targetRoute === route) return;
    const guard = navigationGuardRef.current;
    if (guard) {
      const result = guard();
      if (result.blocked) {
        setNavConfirm({ targetRoute, message: result.message, onSave: result.onSave });
        return;
      }
    }
    setRoute(targetRoute);
  }, [route]);

  // Expose dev helpers for automated testing (Playwright / Puppeteer)
  // Using refs to avoid stale closures — the functions always use current setters
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__DEV_OPEN_FILE__ = (path: string, name: string, folderPath: string) => {
      setCurrentFile({ path, name, folderPath });
    };
    w.__DEV_NAVIGATE__ = (r: AppRoute) => { setRoute(r); };
    // __DEV_SET_LOCALE__: call localeService.change() from E2E test fixtures.
    // Direct window.api.locale.set() bypasses renderer i18next, so this helper
    // is the correct path for locale-switching smoke tests.
    // Wait for localeService.init() to complete, then change locale.
    // Calling change() before init() is dangerous: i18next isn't initialized yet.
    w.__DEV_SET_LOCALE__ = async (locale: string) => {
      await localeService.waitReady();
      return localeService.change(locale as SupportedLocale);
    };
    // Resolves when the service is fully booted (i18next initialized).
    w.__DEV_WAIT_LOCALE_READY__ = () => localeService.waitReady();
    // Returns the current active locale code (for E2E diagnostics).
    w.__DEV_GET_LOCALE__ = () => localeService.getCurrent();
    // Don't clean up — these should persist for the lifetime of the app
  }, []);

  // Listen for Electron menu IPC events
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    cleanups.push(
      window.api.on('menu:openFile', async () => {
        const filePath = await window.api.file.openBmsFile();
        if (filePath) {
          setCurrentFile({ path: filePath, name: basename(filePath), folderPath: dirname(filePath) });
        }
      }),
    );

    cleanups.push(
      window.api.on('menu:openFolder', () => {
        // Navigate to home where folder browsing is available
        setRoute('home');
      }),
    );

    cleanups.push(
      window.api.on('menu:save', () => {
        // Dispatch a synthetic Ctrl+S keydown so the Editor's save handler fires
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
      }),
    );

    cleanups.push(
      window.api.on('menu:saveAs', () => {
        // Dispatch a synthetic Ctrl+Shift+S keydown
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, bubbles: true }));
      }),
    );

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <Layout route={route} onNavigate={handleNavigate} currentFile={currentFile}>
      <ErrorBoundary onReset={handleHome}>
        {route === 'home' && (
          <Home
            currentFile={currentFile}
            onOpenFile={handleOpenFile}
            onPlay={handlePlay}
            onEdit={handleEdit}
          />
        )}
        {route === 'player' && currentFile && (
          <BmsPlayerI18nBridge>
            <Player file={currentFile} onBack={handleHome} onRequestBack={() => handleNavigate('home')} onClearFile={handleClearFile} onRegisterGuard={registerNavigationGuard} />
          </BmsPlayerI18nBridge>
        )}
        {route === 'editor' && currentFile && (
          <BmsEditorI18nBridge>
            <Editor key={currentFile.path} file={currentFile} onBack={handleHome} onClearFile={handleClearFile} onOpenFile={handleOpenFile} onRegisterGuard={registerNavigationGuard} />
          </BmsEditorI18nBridge>
        )}
      </ErrorBoundary>

      {/* Navigation confirmation dialog */}
      {navConfirm && (
        <AccessibleDialog
          open
          onClose={() => setNavConfirm(null)}
          title={t('navigation.leaveTitle')}
          className="border border-zinc-700 p-4 w-80"
        >
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">{t('navigation.leaveTitle')}</h3>
            <p className="text-xs text-zinc-400 mb-4">{navConfirm.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNavConfirm(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
              >
                {t('common:actions.cancel')}
              </button>
              {navConfirm.onSave && (
                <button
                  onClick={() => {
                    const target = navConfirm.targetRoute;
                    setNavConfirm(null);
                    setRoute(target);
                  }}
                  className="px-3 py-1.5 text-xs bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
                >
                  {t('navigation.discardLabel')}
                </button>
              )}
              <button
                onClick={navConfirm.onSave ? async () => {
                  try {
                    const result = await navConfirm.onSave!();
                    if (result === false) return;
                    const target = navConfirm.targetRoute;
                    setNavConfirm(null);
                    setRoute(target);
                  } catch (err) {
                    console.error('[Nav] Save failed:', err);
                  }
                } : () => {
                  const target = navConfirm.targetRoute;
                  setNavConfirm(null);
                  setRoute(target);
                }}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                {navConfirm.onSave ? t('navigation.saveAndLeaveLabel') : t('navigation.leaveLabel')}
              </button>
            </div>
          </div>
        </AccessibleDialog>
      )}
    </Layout>
  );
}
