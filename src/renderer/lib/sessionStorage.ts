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
  const existing = recent.find((r) => r.path === file.path);
  const entry: RecentFileEntry = existing
    ? { ...existing, name: file.name, folderPath: file.folderPath, lastOpened: Date.now() }
    : { path: file.path, name: file.name, folderPath: file.folderPath, lastOpened: Date.now() };
  // Remove old entry if exists, then add to front of unpinned section (LRU)
  const rest = recent.filter((r) => r.path !== file.path);
  const pinned = rest.filter((r) => r.pinned);
  const unpinned = rest.filter((r) => !r.pinned);
  const result = entry.pinned
    ? [entry, ...pinned, ...unpinned]
    : [...pinned, entry, ...unpinned];
  // Pinned entries never count against the LRU cap.
  const trimmed = result.slice(0, MAX_RECENT + pinned.length);
  saveRecentFiles(trimmed);
  return trimmed;
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
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  } catch (err) {
    // Quota / privacy-mode failures must not crash the UI; persistence is best-effort.
    console.warn('[sessionStorage] Failed to save recent files:', err);
  }
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
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[sessionStorage] Failed to save session:', err);
  }
}
