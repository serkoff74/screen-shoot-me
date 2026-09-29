export type CommentKeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey'>;
export type CommentKeyAction = 'commit' | 'newline' | 'cancel' | 'ignore';

export function commentKeyAction(event: CommentKeyInput): CommentKeyAction {
  if (event.key === 'Escape') return 'cancel';
  if (event.key !== 'Enter') return 'ignore';
  return event.shiftKey || event.ctrlKey ? 'newline' : 'commit';
}

export type HistoryKeyInput = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey'>;

export function historyKeyAction(event: HistoryKeyInput): 'undo' | 'redo' | 'ignore' {
  if (!event.ctrlKey && !event.metaKey) return 'ignore';
  const key = event.key.toLowerCase();
  if (key === 'y' || (key === 'z' && event.shiftKey)) return 'redo';
  if (key === 'z') return 'undo';
  return 'ignore';
}
