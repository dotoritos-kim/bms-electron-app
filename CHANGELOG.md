# Changelog

All notable changes to this project will be documented in this file.

This file is automatically maintained by [release-please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org/).

## [0.3.1](https://github.com/dotoritos-kim/bms-electron-app/compare/v0.3.0...v0.3.1) (2026-05-29)


### Bug Fixes

* **e2e:** add __DEV_SET_LOCALE__ helper; use it in ja smoke tests ([d9563cc](https://github.com/dotoritos-kim/bms-electron-app/commit/d9563ccc8982c2bdbcb32057e5b51d33988a82a0))
* **e2e:** add diagnostic logging to ja fixture + __DEV_GET_LOCALE__ helper ([424be25](https://github.com/dotoritos-kim/bms-electron-app/commit/424be2583e042ab74890473bb7a87ea52c8216d7))
* **e2e:** explicitly set ja locale via IPC in window fixture ([3ef2217](https://github.com/dotoritos-kim/bms-electron-app/commit/3ef22178b76e9d369a43e24c145204bc2dac81bc))
* **e2e:** fix waitForFunction arg/options confusion + wait for helper ready ([bbfeb19](https://github.com/dotoritos-kim/bms-electron-app/commit/bbfeb19c42b6d6bbc172ba382bd351913b87e01e))
* **e2e:** guard __DEV_SET_LOCALE__ with waitReady() to prevent race with init ([6c7d4ef](https://github.com/dotoritos-kim/bms-electron-app/commit/6c7d4ef0939966f7a5fc8ab36f99f5d58e3e9cf7))
* **e2e:** navigate to home to clear session-restored error screen ([19fff41](https://github.com/dotoritos-kim/bms-electron-app/commit/19fff4164d640306b0f747c23e4fb45f0a890380))
* **e2e:** use --bms-test-locale CLI arg as primary locale override ([be092fa](https://github.com/dotoritos-kim/bms-electron-app/commit/be092fa2db13de42aa795004dfa3fad974f47994))
* **e2e:** use APP_TEST_LANG env var instead of --lang CLI for ja locale ([9b547f0](https://github.com/dotoritos-kim/bms-electron-app/commit/9b547f0a5b13277e00608606e728cde1adc6d3fb))
* **e2e:** wait for JA button instead of fixed timeout ([b421709](https://github.com/dotoritos-kim/bms-electron-app/commit/b421709394db3052be52794cb3608590d7e55aab))
* **i18n:** notify subscribers after init() completes ([9a360dc](https://github.com/dotoritos-kim/bms-electron-app/commit/9a360dc3d61aaf408c91b70648712b7e8e892bf5))
* **i18n:** parse --lang from process.argv instead of app.commandLine ([bced596](https://github.com/dotoritos-kim/bms-electron-app/commit/bced5962e5ec7acfac9bebca7f4bf799c67df5e1))
* **i18n:** resolve --lang CLI switch in main process locale init ([0b73d99](https://github.com/dotoritos-kim/bms-electron-app/commit/0b73d99e82ebb611c077d3330768dede8dc80ba4))
* **vendor:** update bms-player submodule to rebased fire-12 commit (f7f67cc) ([52c0637](https://github.com/dotoritos-kim/bms-electron-app/commit/52c063760b08a1a6eed358b04ad02a5a08e50179))

## [0.3.0](https://github.com/dotoritos-kim/bms-electron-app/compare/v0.2.2...v0.3.0) (2026-05-29)


### Features

* **i18n:** fire 14 — Japanese full translation (631 keys) ([6010aaa](https://github.com/dotoritos-kim/bms-electron-app/commit/6010aaa1dd4626a6c532456a460af6c283e58d16))
* **i18n:** fire 17 — de/es/ru/zh draft translations (4 gated locales) ([4680ea3](https://github.com/dotoritos-kim/bms-electron-app/commit/4680ea3af89ff791c7288da7d109c8fc460eb476))


### Bug Fixes

* **editor:** save correct panel width after drag-resize (closure bug) ([d85cf00](https://github.com/dotoritos-kim/bms-electron-app/commit/d85cf007a4deb71f46a4b3969bbf42542d331e23))
* **player:** move containerRef to game canvas div, remove hardcoded -36 header offset ([a4b4644](https://github.com/dotoritos-kim/bms-electron-app/commit/a4b4644f1bf4420d7b3870e4e997251afbd6b495))
* **waveform-overlay:** redraw on canvas resize via ResizeObserver ([521147a](https://github.com/dotoritos-kim/bms-electron-app/commit/521147a4c9bfd3c4aafb2c75f09c2bdaa258d38b))

## [0.2.2](https://github.com/dotoritos-kim/bms-electron-app/compare/v0.2.1...v0.2.2) (2026-05-06)


### Bug Fixes

* **e2e:** scope key-binding locator to dialog to avoid header collision ([418638e](https://github.com/dotoritos-kim/bms-electron-app/commit/418638e0e369faa2c81f2bf342e53e9846a743dd))

## [0.2.1](https://github.com/dotoritos-kim/bms-electron-app/compare/v0.2.0...v0.2.1) (2026-05-06)


### Bug Fixes

* **i18n:** mount language switcher so users can change locale ([b5ef147](https://github.com/dotoritos-kim/bms-electron-app/commit/b5ef147144982a6ccb70160bf67c94a9378f9b18))

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
