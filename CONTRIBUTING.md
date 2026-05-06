# Contributing to BMS Desktop

Thanks for considering a contribution. This document covers the practical
checks every PR must clear before it can be merged.

🇰🇷 [한국어 가이드](CONTRIBUTING.ko.md)

## Before you open a PR

1. **Branch from `main`**. Use `feat/...`, `fix/...`, `chore/...` prefixes.
2. **Type check**: `npm run type-check` must pass.
3. **Tests**: `npm test` must pass. Add a regression test for any bug fix.
4. **Lint**: any warnings the linter emits are blocking.
5. **i18n hygiene**:
   - No hardcoded Korean (or any other language) outside `src/shared/i18n/locales/`.
     The custom `no-hardcoded-korean` ESLint rule in `scripts/` catches this in
     CI; running `npm run i18n:check` locally surfaces drift in locale JSON.
   - When you add a new user-facing string, add the key to the relevant
     locale namespace (`common`, `app`, `errors`) for **all enabled
     locales** simultaneously. Empty values fail CI.

## i18n contributions

The project ships with two locales (`ko`, `en`) actively enabled and five
more (`ja`, `zh`, `es`, `de`, `ru`) declared in the i18n infrastructure but
gated behind `ENABLED_LOCALES` until reviewed. To enable or update a gated
locale:

| Action | Required reviewers |
| --- | --- |
| Add a new key to `ko` and `en` | Maintainer review only |
| Update an existing `ko` / `en` translation | Maintainer review only |
| Add or update **non-Korean / non-English** translations | **Two native speakers** for that locale |
| Enable a new locale by adding it to `ENABLED_LOCALES` | Maintainer + two native speakers; PR must demonstrate ≥95% key coverage |

Machine-translated drafts (DeepL, Claude, etc.) are welcome **only** as the
basis for human review — never as the final commit. Mark such PRs with the
`needs-native-review` label.

### Adding a new key

1. Add the key to the relevant `ko` JSON (e.g. `src/shared/i18n/locales/ko/app.json`).
2. Add the equivalent to the `en` JSON. Keep keys parallel.
3. For other locales, leave the key omitted; CI will fail until the parser
   either inserts a placeholder or you supply the translation.
4. Reference it in code via `t('namespace:key.path')` — never inline.

### Library packages (`bms-editor`, `bms-player`)

These packages do **not** depend on `react-i18next`. They expose an
`I18nProvider` context that consumers populate (see [`bms-editor/I18N.md`](
../bms-editor/I18N.md) and [`bms-player/I18N.md`](../bms-player/I18N.md)).
When you add a key inside a library package:

1. Add it to the package's `src/i18n/defaults.ts` with an English default.
2. Use `useI18n().t('your.key')` at the call site.
3. Bump the package's minor version (additions are a minor bump, removals
   are a major bump).
4. Update the consumer's locale JSON (in this repo) with the same key under
   the matching namespace.

## Documentation

- External-facing docs (`README.md`, `CONTRIBUTING.md`, `docs/en/*`) are
  written in **English** as the source of truth. Korean equivalents
  (`README.ko.md`, `docs/ko/*`) are translations and must be updated in the
  same PR or labelled `docs-translation-pending`.
- Internal docs under `.planning/**` stay in Korean — they are working
  notes, not external artefacts.
- Each translated document carries a `last_synced: <commit-sha>` frontmatter
  field; the `scripts/docs-drift-check` job warns when sources drift.

## Code style

- TypeScript `strict` mode (already enabled). Prefer narrow types; never
  add `any` without an explanatory comment.
- React components avoid prop drilling — use Context for cross-cutting
  concerns (see how `LocaleService` is consumed via `useTranslation()` /
  `useI18n()`).
- IPC channels live in `src/shared/ipc-contract.ts`. Adding a channel means
  declaring it in `IpcInvokeMap` / `IpcSendMap` and exposing it through
  preload. Never use raw `ipcRenderer.invoke('some:channel', ...)` from
  renderer code.

## Commit / PR style

- Imperative mood (`add`, `fix`, `refactor`).
- Keep PRs small and focused. Refactors and feature work belong in
  separate PRs.
- The release pipeline is tag-driven; do **not** bump `package.json`
  versions in feature PRs.

## Reporting issues

Please file bugs in the appropriate sibling repository when the root cause
is in `bms-core` / `bms-player` / `bms-editor`. Issues that span multiple
packages or live in the shell go in this repository.
