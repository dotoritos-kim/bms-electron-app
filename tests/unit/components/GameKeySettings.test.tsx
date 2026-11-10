/**
 * Game key settings dialog (bms-player KeyBindingSettings), opened from the
 * player's ready screen. It edits the lanes of the chart's key mode and saves
 * where the game reads them (loadKeyBindingsFor).
 */
import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyBindingSettings, loadKeyBindingsFor } from '@rhythm-archive/bms-player';

function press(code: string) {
  fireEvent.keyDown(window, { code });
}

beforeEach(() => {
  localStorage.clear();
});

describe('KeyBindingSettings', () => {
  it('lists every lane of the key mode with its current key', () => {
    render(<KeyBindingSettings hideTrigger open keyMode="14K" />);
    expect(screen.getAllByTestId(/^key-slot-/)).toHaveLength(16);
    expect(screen.getByTestId('key-slot-SC2').textContent).toContain('R-Shift');
    expect(screen.getByTestId('key-slot-14').textContent).toContain('/');
  });

  it('rebinds a lane and saves it for that key mode', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    render(<KeyBindingSettings hideTrigger open keyMode="9K" onChange={onChange} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByTestId('key-slot-9'));
    press('KeyP');
    expect(screen.getByTestId('key-slot-9').textContent).toContain('P');
    fireEvent.click(screen.getByText('Save'));

    expect(loadKeyBindingsFor('9K')['9']).toBe('KeyP');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ '9': 'KeyP' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Other modes keep their own layout.
    expect(loadKeyBindingsFor('7K')['7']).toBe('KeyL');
  });

  it('a key another lane uses swaps the two lanes', () => {
    render(<KeyBindingSettings hideTrigger open keyMode="7K" />);
    // 7K defaults: lane 1 = S, lane 2 = D
    fireEvent.click(screen.getByTestId('key-slot-1'));
    press('KeyD');
    expect(screen.getByTestId('key-slot-1').textContent).toContain('D');
    expect(screen.getByTestId('key-slot-2').textContent).toContain('S');
  });

  it('ESC cancels listening without binding; reset goes back to the default layout', () => {
    render(<KeyBindingSettings hideTrigger open keyMode="7K" />);
    fireEvent.click(screen.getByTestId('key-slot-1'));
    press('Escape');
    expect(screen.getByTestId('key-slot-1').textContent).toContain('S');

    fireEvent.click(screen.getByTestId('key-slot-1'));
    press('KeyQ');
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByTestId('key-slot-1').textContent).toContain('S');
  });

  it('cancel discards the edits', () => {
    const onOpenChange = vi.fn();
    render(<KeyBindingSettings hideTrigger open keyMode="7K" onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId('key-slot-1'));
    press('KeyQ');
    fireEvent.click(screen.getByText('Cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(loadKeyBindingsFor('7K')['1']).toBe('KeyS');
  });
});
