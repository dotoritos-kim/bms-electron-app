/**
 * Main-process mini i18n dictionary for the native application menu.
 *
 * Why a separate dictionary instead of sharing react-i18next with the
 * renderer:
 *   - This is ~30 keys vs the renderer's ~1,500. Pulling react-i18next into
 *     the main bundle would inflate boot time for negligible reuse.
 *   - main is a different process — there is no way to share an i18next
 *     instance even if we wanted to.
 *   - Keys here are stable; new menu items are rare. The cost of duplication
 *     is small.
 *
 * This module is the source of truth for menu labels. When locale changes the
 * main process rebuilds the menu using `t(locale, key)`.
 */

import type { SupportedLocale } from '../../shared/ipc-contract';

type MenuKey =
  | 'menu.file'
  | 'menu.edit'
  | 'menu.view'
  | 'menu.openFile'
  | 'menu.openFolder'
  | 'menu.save'
  | 'menu.saveAs'
  | 'menu.quit'
  | 'menu.undo'
  | 'menu.redo'
  | 'menu.cut'
  | 'menu.copy'
  | 'menu.paste'
  | 'menu.selectAll'
  | 'menu.reload'
  | 'menu.forceReload'
  | 'menu.toggleDevTools'
  | 'menu.resetZoom'
  | 'menu.zoomIn'
  | 'menu.zoomOut'
  | 'menu.toggleFullScreen';

type MenuDictionary = Record<MenuKey, string>;

const dictionaries: Partial<Record<SupportedLocale, MenuDictionary>> = {
  ko: {
    'menu.file': '파일',
    'menu.edit': '편집',
    'menu.view': '보기',
    'menu.openFile': '파일 열기...',
    'menu.openFolder': '폴더 열기...',
    'menu.save': '저장',
    'menu.saveAs': '다른 이름으로 저장...',
    'menu.quit': '종료',
    'menu.undo': '실행 취소',
    'menu.redo': '다시 실행',
    'menu.cut': '잘라내기',
    'menu.copy': '복사',
    'menu.paste': '붙여넣기',
    'menu.selectAll': '모두 선택',
    'menu.reload': '새로 고침',
    'menu.forceReload': '강제 새로 고침',
    'menu.toggleDevTools': '개발자 도구 토글',
    'menu.resetZoom': '확대/축소 초기화',
    'menu.zoomIn': '확대',
    'menu.zoomOut': '축소',
    'menu.toggleFullScreen': '전체 화면 토글',
  },
  en: {
    'menu.file': 'File',
    'menu.edit': 'Edit',
    'menu.view': 'View',
    'menu.openFile': 'Open File...',
    'menu.openFolder': 'Open Folder...',
    'menu.save': 'Save',
    'menu.saveAs': 'Save As...',
    'menu.quit': 'Quit',
    'menu.undo': 'Undo',
    'menu.redo': 'Redo',
    'menu.cut': 'Cut',
    'menu.copy': 'Copy',
    'menu.paste': 'Paste',
    'menu.selectAll': 'Select All',
    'menu.reload': 'Reload',
    'menu.forceReload': 'Force Reload',
    'menu.toggleDevTools': 'Toggle DevTools',
    'menu.resetZoom': 'Reset Zoom',
    'menu.zoomIn': 'Zoom In',
    'menu.zoomOut': 'Zoom Out',
    'menu.toggleFullScreen': 'Toggle Full Screen',
  },
};

/** Translate a menu key in the given locale, falling back to English. */
export function t(locale: SupportedLocale, key: MenuKey): string {
  return dictionaries[locale]?.[key] ?? dictionaries.en![key];
}

export type { MenuKey };
