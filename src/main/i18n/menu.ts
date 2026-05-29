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
  | 'menu.toggleFullScreen'
  | 'dialog.importKeysound'
  | 'dialog.newBms'
  | 'dialog.openAudio';

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
    'dialog.importKeysound': '키음 파일 가져오기',
    'dialog.newBms': '새 BMS 파일 만들기',
    'dialog.openAudio': '오디오 파일 열기',
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
    'dialog.importKeysound': 'Import keysound files',
    'dialog.newBms': 'Create new BMS file',
    'dialog.openAudio': 'Open audio file',
  },
  ja: {
    'menu.file': 'ファイル',
    'menu.edit': '編集',
    'menu.view': '表示',
    'menu.openFile': 'ファイルを開く...',
    'menu.openFolder': 'フォルダを開く...',
    'menu.save': '保存',
    'menu.saveAs': '名前を付けて保存...',
    'menu.quit': '終了',
    'menu.undo': '元に戻す',
    'menu.redo': 'やり直し',
    'menu.cut': '切り取り',
    'menu.copy': 'コピー',
    'menu.paste': '貼り付け',
    'menu.selectAll': 'すべて選択',
    'menu.reload': '再読み込み',
    'menu.forceReload': '強制再読み込み',
    'menu.toggleDevTools': '開発者ツールを切替',
    'menu.resetZoom': 'ズームをリセット',
    'menu.zoomIn': '拡大',
    'menu.zoomOut': '縮小',
    'menu.toggleFullScreen': 'フルスクリーン切替',
    'dialog.importKeysound': 'キーサウンドファイルをインポート',
    'dialog.newBms': '新規BMSファイル作成',
    'dialog.openAudio': 'オーディオファイルを開く',
  },
};

/** Translate a menu key in the given locale, falling back to English. */
export function t(locale: SupportedLocale, key: MenuKey): string {
  return dictionaries[locale]?.[key] ?? dictionaries.en![key];
}

export type { MenuKey };
