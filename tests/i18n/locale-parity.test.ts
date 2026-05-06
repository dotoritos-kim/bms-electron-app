import { describe, it, expect } from 'vitest';
import koCommon from '../../src/shared/i18n/locales/ko/common.json';
import enCommon from '../../src/shared/i18n/locales/en/common.json';
import koApp from '../../src/shared/i18n/locales/ko/app.json';
import enApp from '../../src/shared/i18n/locales/en/app.json';
import koErrors from '../../src/shared/i18n/locales/ko/errors.json';
import enErrors from '../../src/shared/i18n/locales/en/errors.json';
import koEditor from '../../src/shared/i18n/locales/ko/editor.json';
import enEditor from '../../src/shared/i18n/locales/en/editor.json';
import koPlayer from '../../src/shared/i18n/locales/ko/player.json';
import enPlayer from '../../src/shared/i18n/locales/en/player.json';

/**
 * Parity test: ko and en must define exactly the same keys for every
 * namespace. This is the renderer-side equivalent of the menu dictionary
 * parity test — caught at PR time it prevents shipping a half-translated UI.
 */
function flatten(obj: unknown, prefix = ''): string[] {
  if (obj == null || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object') return flatten(v, key);
    return [key];
  });
}

// Korean's CLDR plural rule is "other" only — i18next-parser emits an
// English-side `_one` companion key that Korean intentionally omits. Strip
// those from the en side before comparison so the missing-by-design keys
// don't trip the parity test.
function stripKoUnneededPlurals(enKeys: string[], koKeys: readonly string[]): string[] {
  const koSet = new Set(koKeys);
  return enKeys.filter((k) => !k.endsWith('_one') || koSet.has(k));
}

describe.each([
  { ns: 'common', ko: koCommon, en: enCommon },
  { ns: 'app', ko: koApp, en: enApp },
  { ns: 'errors', ko: koErrors, en: enErrors },
  { ns: 'editor', ko: koEditor, en: enEditor },
  { ns: 'player', ko: koPlayer, en: enPlayer },
])('locale parity — namespace=$ns', ({ ko, en }) => {
  it('ko and en define the same keys', () => {
    const koKeys = flatten(ko).sort();
    const enKeys = stripKoUnneededPlurals(flatten(en), koKeys).sort();
    expect(koKeys).toEqual(enKeys);
  });

  it('no key resolves to an empty string', () => {
    for (const [bundle, name] of [[ko, 'ko'], [en, 'en']] as const) {
      const empties: string[] = [];
      const walk = (obj: unknown, path = ''): void => {
        if (obj == null || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          const p = path ? `${path}.${k}` : k;
          if (v == null) empties.push(`${name}:${p} (null)`);
          else if (typeof v === 'string' && v.trim() === '') empties.push(`${name}:${p} (empty)`);
          else if (typeof v === 'object') walk(v, p);
        }
      };
      walk(bundle);
      expect(empties).toEqual([]);
    }
  });
});
