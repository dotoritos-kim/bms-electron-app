/**
 * Bridges the renderer's react-i18next instance into the bms-editor and
 * bms-player library packages, which expose a runtime-agnostic
 * `I18nProvider` Context.
 *
 * Why this exists:
 *   - The library packages intentionally don't depend on react-i18next so
 *     other consumers can use a different runtime. The cost is that the
 *     consumer (this app) has to translate its react-i18next `t` into the
 *     package's `Translator` shape and wrap the relevant subtree.
 *   - Wrapping happens at the route boundary so we don't pay the Context
 *     cost on the Home screen, which doesn't render bms-editor/player UI.
 */

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  I18nProvider as EditorI18nProvider,
  type Translator as EditorTranslator,
} from '@rhythm-archive/bms-editor';
import {
  I18nProvider as PlayerI18nProvider,
  type Translator as PlayerTranslator,
} from '@rhythm-archive/bms-player';

interface BridgeProps {
  children: ReactNode;
}

/**
 * Wrap children so any bms-editor component inside reads translations from
 * the `editor` namespace.
 */
export function BmsEditorI18nBridge({ children }: BridgeProps) {
  const { t, i18n } = useTranslation('editor');
  const value = useMemo(
    () => ({
      // The library's `Translator` type is narrower than react-i18next's `t`.
      // We cast through `unknown` because the library only inspects the call
      // signature and ignores extra params.
      t: t as unknown as EditorTranslator,
      locale: i18n.language,
    }),
    [t, i18n.language],
  );
  return <EditorI18nProvider value={value}>{children}</EditorI18nProvider>;
}

export function BmsPlayerI18nBridge({ children }: BridgeProps) {
  const { t, i18n } = useTranslation('player');
  const value = useMemo(
    () => ({
      t: t as unknown as PlayerTranslator,
      locale: i18n.language,
    }),
    [t, i18n.language],
  );
  return <PlayerI18nProvider value={value}>{children}</PlayerI18nProvider>;
}
