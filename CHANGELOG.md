# Changelog

All notable changes to this project will be documented in this file.

This file is automatically maintained by [release-please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org/).

## [0.2.0](https://github.com/dotoritos-kim/bms-electron-app/compare/v0.1.2...v0.2.0) (2026-05-06)


### Features

* **i18n:** migrate pattern library names to i18n keys ([9607726](https://github.com/dotoritos-kim/bms-electron-app/commit/9607726d0d95bc210297c058930fded810f96054))
* **i18n:** multi-language support — ko/en phase 1, 7-locale scaffold ([#16](https://github.com/dotoritos-kim/bms-electron-app/issues/16)) ([0e6ff2e](https://github.com/dotoritos-kim/bms-electron-app/commit/0e6ff2e35f16eb5272533ad240a01e6965c085e2))
* **i18n:** Phase 2 — migrate Tier 1-4 components + fix test setup ([#17](https://github.com/dotoritos-kim/bms-electron-app/issues/17)) ([4b910c2](https://github.com/dotoritos-kim/bms-electron-app/commit/4b910c215842a0f446d25755a6745ef5888d95cc))
* **i18n:** Phase 2 Tier 2 — migrate 5 components + 2 hooks + patternTemplates ([#18](https://github.com/dotoritos-kim/bms-electron-app/issues/18)) ([920641d](https://github.com/dotoritos-kim/bms-electron-app/commit/920641d5baf32e6da79a0c95fccd010584f0346d))
* **i18n:** Tier 6 — Editor.tsx (137 keys) + KeyBindings dialog labels ([#20](https://github.com/dotoritos-kim/bms-electron-app/issues/20)) ([d71716d](https://github.com/dotoritos-kim/bms-electron-app/commit/d71716dc14e8869f4ebd6b71a8882130ffc0e21c))


### Bug Fixes

* **i18n:** boot LocaleService before first render ([4426715](https://github.com/dotoritos-kim/bms-electron-app/commit/442671576bb43d0277aa9714c485048b36b0bace))
* **i18n:** disable Suspense so App mounts before namespaces load ([52507ef](https://github.com/dotoritos-kim/bms-electron-app/commit/52507ef28eab44aced32c9d56d96768feaee7608))
* **i18n:** preload all 5 namespaces at boot to avoid raw-key flash ([#19](https://github.com/dotoritos-kim/bms-electron-app/issues/19)) ([73baaf3](https://github.com/dotoritos-kim/bms-electron-app/commit/73baaf3fc4c15b7395ef14ec4633d995b5bc6bbe))
* **i18n:** register locale IPC handlers in main process ([7e0cd35](https://github.com/dotoritos-kim/bms-electron-app/commit/7e0cd357e8986f13df0b20b6fa9596d4a873a122))


### Code Refactoring

* strict-null cleanup (Editor layer narrowing + WorkerShim) ([#22](https://github.com/dotoritos-kim/bms-electron-app/issues/22)) ([680f128](https://github.com/dotoritos-kim/bms-electron-app/commit/680f128b4c36ede3d6c164d8e6f8c7a2fa00b819))

## [0.1.2] - prior to release-please

Initial baseline. See git history for changes prior to 0.1.2.
