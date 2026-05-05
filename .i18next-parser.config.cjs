/**
 * i18next-parser config for bms-electron-app.
 *
 * Run via `npm run i18n:extract` to scan source files for `t('key')` calls
 * and emit/update locale JSON files. CI uses `npm run i18n:check` (the
 * extract command with `--fail-on-update`) so an unmerged key blocks merge.
 *
 * Conventions:
 *   - All seven locales are listed even though only `ko` and `en` ship in
 *     phase i18n-1. Inactive locales get empty strings — translators fill
 *     them in PRs gated by ENABLED_LOCALES.
 *   - We do NOT auto-translate placeholders; missing strings are written as
 *     empty so review tooling can highlight gaps.
 */

module.exports = {
  contextSeparator: '_',
  createOldCatalogs: false,
  defaultNamespace: 'app',
  defaultValue: '',
  indentation: 2,
  keepRemoved: false,
  keySeparator: '.',
  lexers: {
    js: ['JavascriptLexer'],
    ts: ['JavascriptLexer'],
    jsx: ['JsxLexer'],
    tsx: ['JsxLexer'],
    default: ['JavascriptLexer'],
  },
  lineEnding: 'auto',
  locales: ['ko', 'en', 'ja', 'zh', 'es', 'de', 'ru'],
  namespaceSeparator: ':',
  output: 'src/shared/i18n/locales/$LOCALE/$NAMESPACE.json',
  input: ['src/**/*.{ts,tsx}'],
  sort: true,
  verbose: false,
  failOnWarnings: true,
  failOnUpdate: false, // overridden by `i18n:check` script
  customValueTemplate: null,
  resetDefaultValueLocale: 'ko',
};
