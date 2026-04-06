import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useEditorStore } from '../../src/renderer/stores/editorStore';

/**
 * Reset Zustand editor store to initial state before each test.
 * Call in beforeEach() to ensure test isolation.
 */
export function resetEditorStore() {
  useEditorStore.getState().reset?.();
  useEditorStore.setState(useEditorStore.getInitialState());
}

/**
 * Render a React element with access to the Zustand editor store.
 * Zustand stores are module-level singletons, so no Provider wrapper is needed.
 */
export function renderWithStore(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, options);
}

export { useEditorStore };
