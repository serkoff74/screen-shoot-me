import { mountInlineSnapmark, mountSnapmark } from './editor/editor';
import { isLaunchShortcut } from './editor/keyboard';
import { readSettings, type BeginSelectionMessage, type CaptureRegionResponse, type StartMessage } from './shared';

let cleanup: (() => void) | null = null;
let mounting = false;

async function mountInline(): Promise<void> {
  if (mounting) return;
  mounting = true;
  try {
    cleanup?.();
    cleanup = await mountInlineSnapmark(await readSettings(), async () => {
      const response = await chrome.runtime.sendMessage({ type: 'SNAPMARK_CAPTURE_REGION' }) as CaptureRegionResponse;
      if (!response.ok) throw new Error(response.error);
      return response.dataUrl;
    });
  } finally {
    mounting = false;
  }
}

chrome.runtime.onMessage.addListener((message: StartMessage | BeginSelectionMessage, _sender, sendResponse) => {
  if (message?.type !== 'SNAPMARK_START' && message?.type !== 'SNAPMARK_BEGIN_SELECTION') return false;
  (async () => {
    if (message.type === 'SNAPMARK_BEGIN_SELECTION') {
      await mountInline();
    } else {
      cleanup?.();
      cleanup = await mountSnapmark(message.dataUrl, await readSettings());
    }
    sendResponse({ ok: true });
  })().catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

// Best-effort `Ctrl+PrintScreen`: the Chrome commands API cannot bind this key and
// the desktop environment may grab it first, so it only fires when the key
// actually reaches the page (e.g. after the system screenshot shortcut is freed).
// Both keydown and keyup are handled because `PrintScreen` frequently reports only
// keyup; `mounting`/`cleanup` make a double event harmless.
const handleLaunch = (event: KeyboardEvent) => {
  if (cleanup || mounting || !isLaunchShortcut(event)) return;
  event.preventDefault();
  void mountInline().catch(() => { /* overlay or capture unavailable */ });
};
window.addEventListener('keydown', handleLaunch, true);
window.addEventListener('keyup', handleLaunch, true);
