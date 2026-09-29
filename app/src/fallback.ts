import { mountSnapmark } from './editor/editor';
import { readSettings } from './shared';

const { pendingCapture, fallbackReason } = await chrome.storage.session.get(['pendingCapture', 'fallbackReason']);
if (typeof pendingCapture === 'string') {
  await chrome.storage.session.remove(['pendingCapture', 'fallbackReason']);
  await mountSnapmark(pendingCapture, await readSettings(), async (action, dataUrl, filename) => {
    const response = await chrome.runtime.sendMessage({ type: 'SNAPMARK_EXPORT', action, dataUrl, filename }) as { ok?: boolean; error?: string };
    if (!response?.ok) throw new Error(response?.error ?? 'Ошибка экспорта');
  }, typeof fallbackReason === 'string' ? fallbackReason : 'Chrome запретил встроенный overlay.');
} else {
  document.body.innerHTML = '<main style="font:16px system-ui;padding:40px;color:#334155"><h1>Snapmark</h1><p>Нет активного снимка. Нажмите значок расширения на нужной странице.</p></main>';
}
