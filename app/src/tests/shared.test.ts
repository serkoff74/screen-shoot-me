import { describe, expect, it } from 'vitest';
import { exportFilename } from '../shared';

describe('export filename', () => {
  it('is stable and filesystem-safe', () => {
    expect(exportFilename(new Date(2026, 8, 15, 10, 11, 12))).toBe('snapmark-2026-09-15_10-11-12.png');
  });
});
