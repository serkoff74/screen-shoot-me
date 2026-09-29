import { exportFilename, type BeginSelectionMessage, type CaptureRegionResponse, type ExportMessage, type OffscreenCopyMessage, type RuntimeMessage } from './shared';
import { launchOverlay } from './launch';

async function showActionError(tabId: number, message: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#DC4545' });
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setTitle({ tabId, title: `Snapmark — ${message}` });
  setTimeout(() => {
    void chrome.action.setBadgeText({ tabId, text: '' });
    void chrome.action.setTitle({ tabId, title: 'Snapmark — снимок области' });
  }, 5000);
}

async function injectContentScript(tabId: number): Promise<void> {
  const files = chrome.runtime.getManifest().content_scripts?.flatMap((entry) => entry.js ?? []) ?? [];
  if (!files.length) throw new Error('Content script не найден в manifest');
  await chrome.scripting.executeScript({ target: { tabId }, files });
}

async function openFallback(active: chrome.tabs.Tab): Promise<void> {
  if (active.windowId == null || active.id == null) return;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(active.windowId, { format: 'png' });
    await chrome.storage.session.set({ pendingCapture: dataUrl, fallbackReason: 'Chrome запретил встроить редактор в эту страницу.' });
    await chrome.windows.create({ url: chrome.runtime.getURL('editor.html'), type: 'popup', width: 1180, height: 820 });
  } catch (error) {
    await showActionError(active.id, error instanceof Error ? error.message : 'захват страницы недоступен');
  }
}

async function beginSelection(tab?: chrome.tabs.Tab): Promise<void> {
  const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!active?.id) return;
  const message: BeginSelectionMessage = { type: 'SNAPMARK_BEGIN_SELECTION' };
  await launchOverlay({
    send: () => chrome.tabs.sendMessage(active.id!, message),
    inject: () => injectContentScript(active.id!),
    fallback: () => openFallback(active),
    overlayError: (messageText) => showActionError(active.id!, messageText),
  });
}

chrome.action.onClicked.addListener((tab) => { void beginSelection(tab); });
chrome.commands.onCommand.addListener((command) => { if (command === 'capture-screenshot') void beginSelection(); });

let creatingOffscreen: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.CLIPBOARD], justification: 'Copy the user-created PNG to the clipboard.' }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message?.type === 'SNAPMARK_CAPTURE_REGION') {
    (async () => {
      if (sender.tab?.windowId == null) throw new Error('Не удалось определить окно страницы');
      const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
      const response: CaptureRegionResponse = { ok: true, dataUrl };
      sendResponse(response);
    })().catch((error: unknown) => {
      const response: CaptureRegionResponse = { ok: false, error: error instanceof Error ? error.message : String(error) };
      sendResponse(response);
    });
    return true;
  }
  if (message?.type === 'SNAPMARK_OPEN_SHORTCUTS') {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).then(() => sendResponse({ ok: true }), (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message?.type !== 'SNAPMARK_EXPORT') return false;
  const exportMessage = message as ExportMessage;
  (async () => {
    if (exportMessage.action === 'save') {
      await chrome.downloads.download({ url: exportMessage.dataUrl, filename: exportMessage.filename ?? exportFilename(), saveAs: true });
    } else {
      await ensureOffscreen();
      const request: OffscreenCopyMessage = { type: 'SNAPMARK_COPY_OFFSCREEN', dataUrl: exportMessage.dataUrl };
      const response = await chrome.runtime.sendMessage(request) as { ok?: boolean; error?: string };
      if (!response?.ok) throw new Error(response?.error ?? 'Буфер обмена недоступен');
    }
    sendResponse({ ok: true });
  })().catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
