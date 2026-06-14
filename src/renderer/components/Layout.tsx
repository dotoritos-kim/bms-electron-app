import { Home, Play, Edit } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppRoute, CurrentFile } from '../App';
import { AppStatusBar } from './AppStatusBar';

interface LayoutProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  currentFile: CurrentFile | null;
  children: React.ReactNode;
}

export function Layout({ route, onNavigate, currentFile, children }: LayoutProps) {
  const { t } = useTranslation('app');
  // Editor route owns its own status bar (with LanguageSwitcher inlined),
  // so suppress the global one to avoid stacking two bars.
  const showGlobalStatusBar = route !== 'editor';

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex flex-1 min-h-0 w-full">
        {/* Sidebar */}
        <nav className="w-14 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-3 gap-2 shrink-0">
          <NavButton
            icon={<Home className="h-5 w-5" />}
            active={route === 'home'}
            onClick={() => onNavigate('home')}
            label={t('navigation.homeLabel')}
          />
          <NavButton
            icon={<Play className="h-5 w-5" />}
            active={route === 'player'}
            onClick={() => onNavigate('player')}
            disabled={!currentFile}
            label={t('navigation.playLabel')}
          />
          <NavButton
            icon={<Edit className="h-5 w-5" />}
            active={route === 'editor'}
            onClick={() => onNavigate('editor')}
            disabled={!currentFile}
            label={t('navigation.editLabel')}
          />
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      {showGlobalStatusBar && <AppStatusBar />}
    </div>
  );
}

function NavButton({
  icon,
  active,
  onClick,
  disabled,
  label,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`p-2 rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : disabled
            ? 'text-zinc-600 cursor-not-allowed'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      }`}
    >
      {icon}
    </button>
  );
}
