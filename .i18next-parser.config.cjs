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
  // i18n-2 마이그레이션 진행 중에는 큐레이션된 키를 보호한다.
  // call-site 전환이 완료된 후 false로 되돌려 미사용 키 정리.
  keepRemoved: true,
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
  // main 프로세스는 자체 미니 사전(`src/main/i18n/menu.ts`)을 쓰며 시그니처가
  // `t(locale, key)`라 i18next-parser가 첫 인자(locale)를 키로 오인하고 경고를
  //낸다. renderer/shared만 스캔.
  input: ['src/{renderer,shared}/**/*.{ts,tsx}'],
  sort: true,
  verbose: false,
  failOnWarnings: true,
  failOnUpdate: false, // overridden by `i18n:check` script
  customValueTemplate: null,
  // `resetDefaultValueLocale: 'ko'`는 의도적으로 제거: 매 extract마다 큐레이션된
  // ko 값을 빈 문자열로 덮어쓴다. 새 키는 `defaultValue: ''`로만 추가되고
  // 기존 키는 보존되어야 한다.
};
