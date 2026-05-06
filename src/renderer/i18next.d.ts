/**
 * Type-safe `t()` for the renderer.
 *
 * Augments `i18next` with the resource shape inferred from the bundled JSON
 * files so calls like `t('app:navigation.leaveTitle')` are checked at compile
 * time. New keys: add to the JSON file → TypeScript picks them up.
 */

import 'i18next';
import type appKo from '../shared/i18n/locales/ko/app.json';
import type commonKo from '../shared/i18n/locales/ko/common.json';
import type errorsKo from '../shared/i18n/locales/ko/errors.json';
import type editorKo from '../shared/i18n/locales/ko/editor.json';
import type playerKo from '../shared/i18n/locales/ko/player.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'app';
    resources: {
      common: typeof commonKo;
      app: typeof appKo;
      errors: typeof errorsKo;
      editor: typeof editorKo;
      player: typeof playerKo;
    };
  }
}
