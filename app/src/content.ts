import { mountInlineSnapmark, mountSnapmark } from './editor/editor';
import { readSettings, type BeginSelectionMessage, type CaptureRegionResponse, type StartMessage } from './shared';

let cleanup: (() => void) | null = null;

chrome.runtime.onMessage.addListener((message: StartMessage | BeginSelectionMessage, _sender, sendResponse) => {
  if (message?.type !== 'SNAPMARK_START' && message?.type !== 'SNAPMARK_BEGIN_SELECTION') return false;
  (async () => {
    cleanup?.();
    if (message.type === 'SNAPMARK_BEGIN_SELECTION') {
      cleanup = await mountInlineSnapmark(await readSettings(), async () => {
        const response = await chrome.runtime.sendMessage({ type: 'SNAPMARK_CAPTURE_REGION' }) as CaptureRegionResponse;
        if (!response.ok) throw new Error(response.error);
        return response.dataUrl;
      });
    } else {
      cleanup = await mountSnapmark(message.dataUrl, await readSettings());
    }
    sendResponse({ ok: true });
  })().catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
