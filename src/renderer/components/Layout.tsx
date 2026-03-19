import { Home, Play, Edit } from 'lucide-react';
import type { AppRoute, CurrentFile } from '../App';

interface LayoutProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  currentFile: CurrentFile | null;
  children: React.ReactNode;
}

export function Layout({ route, onNavigate, currentFile, children }: LayoutProps) {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="w-14 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center py-3 gap-2 shrink-0">
        <NavButton
          icon={<Home className="h-5 w-5" />}
          active={route === 'home'}
          onClick={() => onNavigate('home')}
          label="Home"
        />
        <NavButton
          icon={<Play className="h-5 w-5" />}
          active={route === 'player'}
          onClick={() => onNavigate('player')}
          disabled={!currentFile}
          label="Play"
        />
        <NavButton
          icon={<Edit className="h-5 w-5" />}
          active={route === 'editor'}
          onClick={() => onNavigate('editor')}
          disabled={!currentFile}
          label="Edit"
        />
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
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
