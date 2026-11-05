/**
 * KeysoundPanel multi-select: Ctrl/Shift+click picks several keysounds and
 * selects all of their notes at once (one instrument = several samples).
 */
import React from 'react';
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeysoundPanel } from '@rhythm-archive/bms-editor';

const keysounds = {
  '01': 'piano/c4.wav',
  '02': 'piano/d4.wav',
  '03': 'piano/e4.wav',
  '04': 'drum/kick.wav',
};

function setup(currentKeysound = '00') {
  const onSelect = vi.fn();
  const onSelectNotesByKeysounds = vi.fn();
  render(
    <KeysoundPanel
      keysounds={keysounds}
      currentKeysound={currentKeysound}
      onSelect={onSelect}
      onSelectNotesByKeysounds={onSelectNotesByKeysounds}
    />,
  );
  const row = (id: string) => screen.getByText(id).closest('button')!;
  return { onSelect, onSelectNotesByKeysounds, row };
}

describe('KeysoundPanel multi-select', () => {
  it('Ctrl+click picks keysounds without changing the current keysound', () => {
    const { onSelect, onSelectNotesByKeysounds, row } = setup();
    fireEvent.click(row('01'), { ctrlKey: true });
    fireEvent.click(row('03'), { ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId('keysound-checked-bar')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('keysound-checked-select-bgm'));
    expect(onSelectNotesByKeysounds).toHaveBeenCalledWith(['01', '03'], { bgmOnly: true });
  });

  it('Ctrl+click again un-picks a keysound', () => {
    const { row } = setup();
    fireEvent.click(row('01'), { ctrlKey: true });
    fireEvent.click(row('01'), { ctrlKey: true });
    expect(screen.queryByTestId('keysound-checked-bar')).toBeNull();
  });

  it('only checks what was Ctrl+clicked, not the keysound picked for placing notes', () => {
    const { onSelectNotesByKeysounds, row } = setup('02');
    fireEvent.click(row('04'), { ctrlKey: true });
    fireEvent.click(screen.getByTestId('keysound-checked-select-bgm'));
    expect(onSelectNotesByKeysounds).toHaveBeenCalledWith(['04'], { bgmOnly: true });
  });

  it('Shift+click picks a range in list order', () => {
    const { onSelect, onSelectNotesByKeysounds, row } = setup();
    fireEvent.click(row('01'));
    expect(onSelect).toHaveBeenCalledWith('01');
    fireEvent.click(row('03'), { shiftKey: true });
    fireEvent.click(screen.getByText(/all notes/i));
    // drum/ sorts before piano/, so 01..03 is exactly the piano folder
    expect(onSelectNotesByKeysounds).toHaveBeenCalledWith(['01', '02', '03'], { bgmOnly: false });
  });

  it('Ctrl+click on a folder header picks the whole folder', () => {
    const { onSelectNotesByKeysounds } = setup();
    fireEvent.click(screen.getByText(/piano/).closest('button')!, { ctrlKey: true });
    fireEvent.click(screen.getByTestId('keysound-checked-select-bgm'));
    expect(onSelectNotesByKeysounds).toHaveBeenCalledWith(['01', '02', '03'], { bgmOnly: true });
  });

  it('a plain click clears the picked keysounds', () => {
    const { onSelect, row } = setup();
    fireEvent.click(row('01'), { ctrlKey: true });
    fireEvent.click(row('04'));
    expect(onSelect).toHaveBeenCalledWith('04');
    expect(screen.queryByTestId('keysound-checked-bar')).toBeNull();
  });
});
