import { describe, expect, it } from 'vitest';
import { History } from '../editor/history';

describe('history', () => {
  it('undoes and redoes state', () => {
    const history = new History<number[]>([]);
    history.push([1]);
    history.push([1, 2]);
    expect(history.undo()).toEqual([1]);
    expect(history.redo()).toEqual([1, 2]);
  });
  it('clears redo after a new edit', () => {
    const history = new History(0);
    history.push(1);
    history.undo();
    history.push(2);
    expect(history.canRedo).toBe(false);
    expect(history.current).toBe(2);
  });

  it('undoes a committed comment before its annotation', () => {
    type Annotation = { id: string; label?: string };
    const arrow: Annotation[] = [{ id: 'arrow-1' }];
    const withComment: Annotation[] = [{ id: 'arrow-1', label: 'Комментарий' }];
    const history = new History<Annotation[]>([]);

    history.push(arrow);
    history.push(withComment);

    expect(history.undo()).toEqual(arrow);
    expect(history.undo()).toEqual([]);
  });
});
