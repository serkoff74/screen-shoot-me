import { describe, expect, it, vi } from 'vitest';
import { launchOverlay } from '../launch';

function actions(send: () => Promise<{ ok?: boolean; error?: string } | undefined>, inject = vi.fn(async () => {})) {
  return {
    send,
    inject,
    fallback: vi.fn(async () => {}),
    overlayError: vi.fn(async () => {}),
  };
}

describe('overlay-first launch order', () => {
  it('uses the existing content script without capture fallback', async () => {
    const current = actions(vi.fn(async () => ({ ok: true })));
    expect(await launchOverlay(current)).toBe('overlay');
    expect(current.inject).not.toHaveBeenCalled();
    expect(current.fallback).not.toHaveBeenCalled();
  });

  it('injects and retries for an older ordinary tab', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce({ ok: true });
    const current = actions(send);
    expect(await launchOverlay(current)).toBe('overlay');
    expect(send).toHaveBeenCalledTimes(2);
    expect(current.inject).toHaveBeenCalledTimes(1);
    expect(current.fallback).not.toHaveBeenCalled();
  });

  it('uses fallback only when Chrome rejects injection', async () => {
    const current = actions(
      vi.fn(async () => { throw new Error('No receiver'); }),
      vi.fn(async () => { throw new Error('Cannot access chrome:// URL'); }),
    );
    expect(await launchOverlay(current)).toBe('fallback');
    expect(current.fallback).toHaveBeenCalledTimes(1);
    expect(current.overlayError).not.toHaveBeenCalled();
  });

  it('shows an error instead of a window when retry fails after injection', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('No receiver'))
      .mockResolvedValueOnce({ ok: false, error: 'Overlay failed' });
    const current = actions(send);
    expect(await launchOverlay(current)).toBe('error');
    expect(current.fallback).not.toHaveBeenCalled();
    expect(current.overlayError).toHaveBeenCalledWith('Overlay failed');
  });
});
