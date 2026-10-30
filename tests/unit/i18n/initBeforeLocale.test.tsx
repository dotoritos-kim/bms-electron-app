/**
 * The Editor crashed when it rendered before the locale IPC answered:
 * useTranslation ran fewer hooks until initReactI18next was applied, then
 * more, and React threw. Importing the init module must register the
 * instance (and turn Suspense off) before init() is ever called.
 *
 * tests/setup.ts initializes the shared instance for every test, so this
 * checks the registration calls rather than the pre-init render.
 */
import { describe, it, expect, vi } from 'vitest';

const { setI18n, setDefaults } = vi.hoisted(() => ({ setI18n: vi.fn(), setDefaults: vi.fn() }));

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  setI18n,
  setDefaults,
}));

describe('i18n init module', () => {
  it('registers the instance with react-i18next on import, before init()', async () => {
    const { i18next } = await import('../../../src/renderer/i18n/init');
    expect(setDefaults).toHaveBeenCalledWith({ useSuspense: false });
    expect(setI18n).toHaveBeenCalledWith(i18next);
  });
});
