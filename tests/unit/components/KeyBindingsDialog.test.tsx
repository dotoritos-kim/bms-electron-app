import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { KeyBindingsDialog } from '../../../src/renderer/components/KeyBindingsDialog';
import {
  ACTION_CATEGORIES,
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  keyComboToDisplay,
  saveKeyBindings,
} from '../../../src/renderer/lib/keyBindings';
import type { KeyBinding, KeyAction } from '../../../src/renderer/lib/keyBindings';

vi.mock('../../../src/renderer/lib/keyBindings', async () => {
  const actual = await vi.importActual('../../../src/renderer/lib/keyBindings');
  return { ...actual, saveKeyBindings: vi.fn() };
});

function renderDialog(overrides: Partial<Parameters<typeof KeyBindingsDialog>[0]> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    bindings: [...DEFAULT_BINDINGS],
    onBindingsChange: vi.fn(),
  };
  const props = { ...defaultProps, ...overrides };
  const result = render(<KeyBindingsDialog {...props} />);
  return { ...result, props };
}

/** Create a bindings array where two actions share the same key to trigger conflict */
function makeConflictBindings(): KeyBinding[] {
  return DEFAULT_BINDINGS.map((b) =>
    b.action === 'redo' ? { ...b, key: 'ctrl+z' } : b,
  );
}

describe('KeyBindingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Returns null when open=false
  it('returns null when open is false', () => {
    const { container } = renderDialog({ open: false });
    expect(container.innerHTML).toBe('');
  });

  // 2. Renders title when open=true (appears in both sr-only and visible h2)
  it('renders the title "키 바인딩 설정" when open is true', () => {
    renderDialog();
    const titles = screen.getAllByText('키 바인딩 설정');
    expect(titles.length).toBeGreaterThanOrEqual(1);
    expect(titles[0]).toBeInTheDocument();
  });

  // 3. Renders all action categories
  it('renders all action category headings from ACTION_CATEGORIES', () => {
    renderDialog();
    for (const cat of ACTION_CATEGORIES) {
      expect(screen.getByText(cat.label)).toBeInTheDocument();
    }
  });

  // 4. Each action shows its label from ACTION_LABELS
  // Note: "저장" appears both as the 'save' action label and the footer Save button text,
  // so we use getAllByText for labels that may have duplicates.
  it('renders all action labels from ACTION_LABELS', () => {
    renderDialog();
    const allActions = ACTION_CATEGORIES.flatMap((c) => c.actions);
    for (const action of allActions) {
      const elements = screen.getAllByText(ACTION_LABELS[action]);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  // 5. Each action shows its current key combo display
  it('displays the key combo for each binding', () => {
    renderDialog();
    // Check a few representative bindings
    expect(screen.getByText(keyComboToDisplay('ctrl+s'))).toBeInTheDocument();
    expect(screen.getByText(keyComboToDisplay('ctrl+z'))).toBeInTheDocument();
    expect(screen.getByText(keyComboToDisplay('f5'))).toBeInTheDocument();
  });

  // 6. Clicking a key button enters editing mode and shows "키 입력 대기..."
  it('shows "키 입력 대기..." when an action key button is clicked', () => {
    renderDialog();
    const saveKeyButton = screen.getByText(keyComboToDisplay('ctrl+s'));
    fireEvent.click(saveKeyButton);
    expect(screen.getByText('키 입력 대기...')).toBeInTheDocument();
  });

  // 7. Only one action can be in editing mode at a time
  it('replaces the previous editing state when another action is clicked', () => {
    renderDialog();
    const saveKeyButton = screen.getByText(keyComboToDisplay('ctrl+s'));
    fireEvent.click(saveKeyButton);
    expect(screen.getByText('키 입력 대기...')).toBeInTheDocument();

    // Click a different action's key button
    const undoKeyButton = screen.getByText(keyComboToDisplay('ctrl+z'));
    fireEvent.click(undoKeyButton);

    // Only one "키 입력 대기..." should be visible
    const waitingTexts = screen.getAllByText('키 입력 대기...');
    expect(waitingTexts).toHaveLength(1);
  });

  // 8. Pressing a key while editing updates the local binding
  it('updates the binding when a key is pressed during editing', () => {
    renderDialog();
    const saveKeyButton = screen.getByText(keyComboToDisplay('ctrl+s'));
    fireEvent.click(saveKeyButton);

    // Simulate pressing Ctrl+P
    fireEvent.keyDown(window, {
      key: 'p',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });

    // Editing mode should end (no "키 입력 대기...")
    expect(screen.queryByText('키 입력 대기...')).not.toBeInTheDocument();
    // The save action should now show Ctrl+P
    expect(screen.getByText('Ctrl+P')).toBeInTheDocument();
  });

  // 9. Lone modifier keys are ignored when editing
  it('ignores lone modifier keys during editing', () => {
    renderDialog();
    const saveKeyButton = screen.getByText(keyComboToDisplay('ctrl+s'));
    fireEvent.click(saveKeyButton);

    fireEvent.keyDown(window, { key: 'Shift' });
    // Still in editing mode
    expect(screen.getByText('키 입력 대기...')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Control' });
    expect(screen.getByText('키 입력 대기...')).toBeInTheDocument();
  });

  // 10. Conflict detection: two actions with same key show "충돌"
  it('shows "충돌" when two actions share the same key', () => {
    const conflictBindings = makeConflictBindings();
    renderDialog({ bindings: conflictBindings });

    const conflictTexts = screen.getAllByText('충돌');
    expect(conflictTexts.length).toBeGreaterThanOrEqual(2);
  });

  // 11. Conflict count is displayed
  it('displays the conflict count message when conflicts exist', () => {
    const conflictBindings = makeConflictBindings();
    renderDialog({ bindings: conflictBindings });

    // "undo" and "redo" both have "ctrl+z" → 2 conflicting actions
    expect(screen.getByText('2개 항목 키 충돌')).toBeInTheDocument();
  });

  // 12. No conflict text when no conflicts
  it('does not show conflict text when no conflicts exist', () => {
    renderDialog();
    expect(screen.queryByText('충돌')).not.toBeInTheDocument();
    expect(screen.queryByText(/개 항목 키 충돌/)).not.toBeInTheDocument();
  });

  // 13. Reset button restores DEFAULT_BINDINGS
  it('restores DEFAULT_BINDINGS when "기본값 복원" is clicked', () => {
    // Start with a modified binding
    const modified = DEFAULT_BINDINGS.map((b) =>
      b.action === 'save' ? { ...b, key: 'ctrl+shift+p' } : b,
    );
    renderDialog({ bindings: modified });

    expect(screen.getByText('Ctrl+Shift+P')).toBeInTheDocument();

    fireEvent.click(screen.getByText('기본값 복원'));

    // After reset, the save action should be back to Ctrl+S
    expect(screen.getByText(keyComboToDisplay('ctrl+s'))).toBeInTheDocument();
    expect(screen.queryByText('Ctrl+Shift+P')).not.toBeInTheDocument();
  });

  // 14. Save button calls saveKeyBindings, onBindingsChange, and onClose
  it('calls saveKeyBindings, onBindingsChange, and onClose when "저장" is clicked', () => {
    const { props } = renderDialog();

    // "저장" appears as both an action label and the footer save button.
    // The footer save button has bg-blue-600 class to distinguish it.
    const saveButtons = screen.getAllByText('저장');
    const footerSaveButton = saveButtons.find((el) => el.closest('button.px-3'));
    expect(footerSaveButton).toBeTruthy();
    fireEvent.click(footerSaveButton!);

    expect(saveKeyBindings).toHaveBeenCalledWith(DEFAULT_BINDINGS);
    expect(props.onBindingsChange).toHaveBeenCalledWith(DEFAULT_BINDINGS);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  // 15. Save button persists locally edited bindings
  it('saves the locally edited bindings, not the original prop bindings', () => {
    const { props } = renderDialog();

    // Edit the 'save' key to ctrl+p
    const saveKeyButton = screen.getByText(keyComboToDisplay('ctrl+s'));
    fireEvent.click(saveKeyButton);
    fireEvent.keyDown(window, {
      key: 'p',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });

    const saveButtons = screen.getAllByText('저장');
    const footerSaveButton = saveButtons.find((el) => el.closest('button.px-3'));
    fireEvent.click(footerSaveButton!);

    const savedBindings = (saveKeyBindings as ReturnType<typeof vi.fn>).mock.calls[0][0] as KeyBinding[];
    const saveBinding = savedBindings.find((b: KeyBinding) => b.action === 'save');
    expect(saveBinding?.key).toBe('ctrl+p');
    expect(props.onBindingsChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: 'save', key: 'ctrl+p' })]),
    );
  });

  // 16. Cancel button calls onClose
  it('calls onClose when "취소" is clicked', () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByText('취소'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  // 17. X button calls onClose
  it('calls onClose when the X button is clicked', () => {
    const { props } = renderDialog();
    // The visible title h2 has class "text-sm"; find the header div containing it and the X button
    const visibleTitle = screen.getAllByText('키 바인딩 설정').find(
      (el) => !el.classList.contains('sr-only'),
    )!;
    const headerArea = visibleTitle.closest('div')!;
    const xButton = within(headerArea).getByRole('button');
    fireEvent.click(xButton);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  // 18. Reset clears editing mode
  it('clears editing mode when reset is clicked', () => {
    renderDialog();
    const saveKeyButton = screen.getByText(keyComboToDisplay('ctrl+s'));
    fireEvent.click(saveKeyButton);
    expect(screen.getByText('키 입력 대기...')).toBeInTheDocument();

    fireEvent.click(screen.getByText('기본값 복원'));
    expect(screen.queryByText('키 입력 대기...')).not.toBeInTheDocument();
  });

  // 19. Bindings prop sync: updating bindings prop resets local state
  it('syncs localBindings when the bindings prop changes', () => {
    const modified = DEFAULT_BINDINGS.map((b) =>
      b.action === 'save' ? { ...b, key: 'ctrl+shift+p' } : b,
    );
    const { rerender, props } = renderDialog();

    // Initially shows default Ctrl+S
    expect(screen.getByText(keyComboToDisplay('ctrl+s'))).toBeInTheDocument();

    // Re-render with modified bindings
    rerender(
      <KeyBindingsDialog
        open={true}
        onClose={props.onClose}
        bindings={modified}
        onBindingsChange={props.onBindingsChange}
      />,
    );

    expect(screen.getByText('Ctrl+Shift+P')).toBeInTheDocument();
  });

  // 20. Dialog has correct ARIA attributes
  it('renders with role="dialog" and aria-modal="true"', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
