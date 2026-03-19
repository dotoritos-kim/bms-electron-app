import { useState, useCallback } from 'react';
import { Home } from './routes/Home';
import { Player } from './routes/Player';
import { Editor } from './routes/Editor';
import { Layout } from './components/Layout';

export type AppRoute = 'home' | 'player' | 'editor';

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

  return (
    <Layout route={route} onNavigate={setRoute} currentFile={currentFile}>
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
    </Layout>
  );
}
