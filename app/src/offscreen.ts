import type { OffscreenCopyMessage } from './shared';

chrome.runtime.onMessage.addListener((message: OffscreenCopyMessage, _sender, sendResponse) => {
  if (message?.type !== 'SNAPMARK_COPY_OFFSCREEN') return false;
  (async () => {
    const blob = await (await fetch(message.dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    sendResponse({ ok: true });
  })().catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
