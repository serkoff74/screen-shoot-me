export type CommentKeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey'>;
export type CommentKeyAction = 'commit' | 'newline' | 'cancel' | 'ignore';

export function commentKeyAction(event: CommentKeyInput): CommentKeyAction {
  if (event.key === 'Escape') return 'cancel';
  if (event.key !== 'Enter') return 'ignore';
  return event.shiftKey || event.ctrlKey ? 'newline' : 'commit';
}

export type HistoryKeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey'> & { code?: string };

export function historyKeyAction(event: HistoryKeyInput): 'undo' | 'redo' | 'ignore' {
  if (!event.ctrlKey && !event.metaKey) return 'ignore';
  // `event.code` is layout independent: with a Cyrillic (or any non-Latin)
  // layout `event.key` is `я`/`н` instead of `z`/`y`, so the hotkey would fail.
  const key = event.key.toLowerCase();
  const isZ = event.code === 'KeyZ' || key === 'z';
  const isY = event.code === 'KeyY' || key === 'y';
  if (isY || (isZ && event.shiftKey)) return 'redo';
  if (isZ) return 'undo';
  return 'ignore';
}
