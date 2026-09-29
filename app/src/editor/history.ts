export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private currentValue: T) {}
  get current(): T { return this.currentValue; }
  push(next: T): T { this.past.push(this.currentValue); this.currentValue = next; this.future = []; return next; }
  undo(): T { const value = this.past.pop(); if (value === undefined) return this.currentValue; this.future.push(this.currentValue); this.currentValue = value; return value; }
  redo(): T { const value = this.future.pop(); if (value === undefined) return this.currentValue; this.past.push(this.currentValue); this.currentValue = value; return value; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
}
