/**
 * Session/Recent files persistence (localStorage)
 */

import type { CurrentFile } from '../App';
import type { AppRoute } from '../App';

// --- Recent Files ---

export interface RecentFileEntry {
  path: string;
  name: string;
  folderPath: string;
  lastOpened: number; // timestamp
  pinned?: boolean;
}

const RECENT_FILES_KEY = 'bms-recent-files';
const MAX_RECENT = 10;

export function loadRecentFiles(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentFileEntry[];
  } catch {
    return [];
  }
}

export function addRecentFile(file: CurrentFile): RecentFileEntry[] {
  const recent = loadRecentFiles();
  // Remove existing entry for same path
  const filtered = recent.filter((r) => r.path !== file.path);
  const entry: RecentFileEntry = {
    path: file.path,
    name: file.name,
    folderPath: file.folderPath,
    lastOpened: Date.now(),
  };
  // Preserve pinned status
  const old = recent.find((r) => r.path === file.path);
  if (old?.pinned) entry.pinned = true;
  // Add to front
  const updated = [entry, ...filtered];
  // Trim non-pinned entries to MAX_RECENT
  const pinned = updated.filter((r) => r.pinned);
  const unpinned = updated.filter((r) => !r.pinned);
  const result = [...pinned, ...unpinned].slice(0, MAX_RECENT + pinned.length);
  saveRecentFiles(result);
  return result;
}

export function removeRecentFile(path: string): RecentFileEntry[] {
  const recent = loadRecentFiles().filter((r) => r.path !== path);
  saveRecentFiles(recent);
  return recent;
}

export function togglePinRecentFile(path: string): RecentFileEntry[] {
  const recent = loadRecentFiles().map((r) =>
    r.path === path ? { ...r, pinned: !r.pinned } : r,
  );
  saveRecentFiles(recent);
  return recent;
}

function saveRecentFiles(files: RecentFileEntry[]): void {
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
}

// --- Session Restore ---

export interface SessionData {
  lastRoute: AppRoute;
  lastFile: CurrentFile | null;
}

const SESSION_KEY = 'bms-session';

export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function saveSession(data: SessionData): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}
