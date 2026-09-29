import { describe, expect, it } from 'vitest';
import { commentKeyAction, historyKeyAction, isPrintScreenKey } from '../editor/keyboard';

describe('comment keyboard contract', () => {
  it('commits on plain Enter', () => {
    expect(commentKeyAction({ key: 'Enter', shiftKey: false, ctrlKey: false })).toBe('commit');
  });

  it('adds a line for both supported modifiers', () => {
    expect(commentKeyAction({ key: 'Enter', shiftKey: true, ctrlKey: false })).toBe('newline');
    expect(commentKeyAction({ key: 'Enter', shiftKey: false, ctrlKey: true })).toBe('newline');
  });

  it('cancels on Escape and ignores other keys', () => {
    expect(commentKeyAction({ key: 'Escape', shiftKey: false, ctrlKey: false })).toBe('cancel');
    expect(commentKeyAction({ key: 'a', shiftKey: false, ctrlKey: false })).toBe('ignore');
  });

  it('maps Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y to history', () => {
    expect(historyKeyAction({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('undo');
    expect(historyKeyAction({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: true })).toBe('redo');
    expect(historyKeyAction({ key: 'y', ctrlKey: false, metaKey: true, shiftKey: false })).toBe('redo');
  });

  it('detects PrintScreen by key or physical code', () => {
    expect(isPrintScreenKey({ key: 'PrintScreen' })).toBe(true);
    expect(isPrintScreenKey({ key: 'Unidentified', code: 'PrintScreen' })).toBe(true);
    expect(isPrintScreenKey({ key: 'Insert', code: 'Insert' })).toBe(false);
  });

  it('matches the physical key so history works on a non-Latin layout', () => {
    expect(historyKeyAction({ key: 'я', code: 'KeyZ', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('undo');
    expect(historyKeyAction({ key: 'Я', code: 'KeyZ', ctrlKey: true, metaKey: false, shiftKey: true })).toBe('redo');
    expect(historyKeyAction({ key: 'н', code: 'KeyY', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('redo');
    expect(historyKeyAction({ key: 'я', code: 'KeyZ', ctrlKey: false, metaKey: false, shiftKey: false })).toBe('ignore');
  });
});
