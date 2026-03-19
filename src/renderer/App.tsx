import { useState, useCallback, useEffect, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Home } from './routes/Home';
import { Player } from './routes/Player';
import { Editor } from './routes/Editor';
import { Layout } from './components/Layout';

export type AppRoute = 'home' | 'player' | 'editor';

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
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Rendering Error</h2>
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
            Go Home
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
  const [route, setRoute] = useState<AppRoute>('home');
  const [currentFile, setCurrentFile] = useState<CurrentFile | null>(null);

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

  // Expose dev helpers for automated testing (Puppeteer)
  // Using refs to avoid stale closures — the functions always use current setters
  useEffect(() => {
    const w = window as Record<string, unknown>;
    w.__DEV_OPEN_FILE__ = (path: string, name: string, folderPath: string) => {
      setCurrentFile({ path, name, folderPath });
    };
    w.__DEV_NAVIGATE__ = (r: AppRoute) => { setRoute(r); };
    // Don't clean up — these should persist for the lifetime of the app
  }, []);

  return (
    <Layout route={route} onNavigate={setRoute} currentFile={currentFile}>
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
          <Player file={currentFile} onBack={handleHome} />
        )}
        {route === 'editor' && currentFile && (
          <Editor file={currentFile} onBack={handleHome} />
        )}
      </ErrorBoundary>
    </Layout>
  );
}
