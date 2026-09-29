import { DEFAULT_SETTINGS, exportFilename, makeId, type Annotation, type Bounds, type Point, type SnapmarkSettings, type Tool } from '../shared';
import { captureScale, hitTest, hitTestLabel, isDrawable, labelAnchor, labelBounds, labelHandleAt, type LabelHandlePosition, moved, movedLabel, normalizedBounds, resizedLabel, withCardAnchor } from './geometry';
import { History } from './history';
import { icon } from './icons';
import { commentKeyAction, historyKeyAction } from './keyboard';
import { cropImage, drawScene, exportPng, loadImage } from './render';
import { editorCss } from './styles';

type Exporter = (action: 'copy' | 'save', dataUrl: string, filename: string) => Promise<void>;
type CaptureRequester = () => Promise<string>;

const toolNames: Record<Tool, string> = { select: 'Выбор', arrow: 'Стрелка', rect: 'Прямоугольник', ellipse: 'Овал', pencil: 'Карандаш', text: 'Текст' };

function defaultExporter(): Exporter {
  return async (action, png, filename) => {
    const response = await chrome.runtime.sendMessage({ type: 'SNAPMARK_EXPORT', action, dataUrl: png, filename }) as { ok?: boolean; error?: string };
    if (!response?.ok) throw new Error(response?.error ?? 'Ошибка экспорта');
  };
}

function lockPage(root: HTMLElement): () => void {
  const html = document.documentElement;
  const body = document.body;
  const previous = {
    overflow: html.style.overflow,
    paddingRight: html.style.paddingRight,
    overscrollBehavior: html.style.overscrollBehavior,
    bodyOverscrollBehavior: body?.style.overscrollBehavior ?? '',
  };
  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
  const computedPadding = Number.parseFloat(getComputedStyle(html).paddingRight) || 0;
  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  if (scrollbarWidth) html.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
  if (body) body.style.overscrollBehavior = 'none';
  const blockWheel = (event: WheelEvent) => event.preventDefault();
  root.addEventListener('wheel', blockWheel, { passive: false });
  return () => {
    root.removeEventListener('wheel', blockWheel);
    html.style.overflow = previous.overflow;
    html.style.paddingRight = previous.paddingRight;
    html.style.overscrollBehavior = previous.overscrollBehavior;
    if (body) body.style.overscrollBehavior = previous.bodyOverscrollBehavior;
  };
}

function createOverlayHost(): { host: HTMLDivElement; root: HTMLDivElement } {
  const host = document.createElement('div');
  host.id = 'snapmark-extension-root';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = editorCss;
  shadow.append(style);
  const root = document.createElement('div');
  root.className = 'root';
  shadow.append(root);
  document.documentElement.append(host);
  return { host, root };
}

export async function mountInlineSnapmark(settings: SnapmarkSettings = DEFAULT_SETTINGS, requestCapture: CaptureRequester, exporter?: Exporter): Promise<() => void> {
  const { host, root } = createOverlayHost();
  root.dataset.captureRequests = '0';
  root.innerHTML = selectionMarkup(undefined, true);
  const unlockPage = lockPage(root);
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    root.dispatchEvent(new Event('snapmark-cleanup'));
    unlockPage();
    host.remove();
  };
  setupInlineSelection(root, settings, requestCapture, exporter ?? defaultExporter(), cleanup);
  return cleanup;
}

export async function mountSnapmark(dataUrl: string, settings: SnapmarkSettings = DEFAULT_SETTINGS, exporter?: Exporter, contextNote?: string): Promise<() => void> {
  const image = await loadImage(dataUrl);
  const { host, root } = createOverlayHost();
  root.innerHTML = selectionMarkup(dataUrl, false, contextNote);
  const unlockPage = lockPage(root);
  const cleanup = () => {
    root.dispatchEvent(new Event('snapmark-cleanup'));
    unlockPage();
    host.remove();
  };
  const runExport = exporter ?? defaultExporter();
  setupSelection(root, image, settings, runExport, cleanup);
  return cleanup;
}

function selectionMarkup(dataUrl?: string, live = false, contextNote?: string): string {
  const background = dataUrl ? `<img class="capture-bg" src="${dataUrl}" alt=""><div class="capture-mask"></div>` : '';
  const instruction = contextNote ? `${contextNote} Выберите область.` : 'Протяните рамку вокруг нужной области';
  const shades = live ? '<div class="capture-shade hidden" data-capture-shade="top"></div><div class="capture-shade hidden" data-capture-shade="left"></div><div class="capture-shade hidden" data-capture-shade="right"></div><div class="capture-shade hidden" data-capture-shade="bottom"></div>' : '';
  return `<div class="capture ${live ? 'live' : ''}">${background}${shades}<div class="capture-box hidden"></div><div class="capture-tip">${icon('select')}<span>${instruction}</span><span class="kbd">Esc</span><span>отмена</span></div></div>`;
}

function setupInlineSelection(root: HTMLElement, settings: SnapmarkSettings, requestCapture: CaptureRequester, exporter: Exporter, cleanup: () => void): void {
  const capture = root.querySelector<HTMLElement>('.capture')!;
  const box = root.querySelector<HTMLElement>('.capture-box')!;
  const tip = root.querySelector<HTMLElement>('.capture-tip')!;
  let start: Point | null = null;
  let crop: Bounds | null = null;
  let pending = false;
  capture.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pending) return;
    start = { x: event.clientX, y: event.clientY };
    crop = { x: start.x, y: start.y, width: 0, height: 0 };
    box.classList.remove('hidden');
    capture.setPointerCapture(event.pointerId);
  });
  capture.addEventListener('pointermove', (event) => {
    if (!start || pending) return;
    crop = normalizedBounds(start, { x: event.clientX, y: event.clientY });
    updateCaptureBox(box, crop);
    updateCaptureBackdrop(capture, crop);
  });
  capture.addEventListener('pointerup', async (event) => {
    if (!start || !crop || pending) return;
    capture.releasePointerCapture(event.pointerId);
    start = null;
    if (crop.width < 24 || crop.height < 24) { box.classList.add('hidden'); return; }
    pending = true;
    const selected = { ...crop };
    capture.classList.add('capture-pending');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      root.dataset.captureRequests = String(Number(root.dataset.captureRequests ?? '0') + 1);
      const dataUrl = await requestCapture();
      const image = await loadImage(dataUrl);
      const scale = captureScale(image.naturalWidth, image.naturalHeight, window.innerWidth, window.innerHeight);
      const background = cropImage(image, selected, scale.x, scale.y);
      window.removeEventListener('keydown', key, true);
      showEditor(root, background, settings, exporter, cleanup, selected);
    } catch (error) {
      pending = false;
      capture.classList.remove('capture-pending');
      box.classList.add('hidden');
      capture.querySelectorAll<HTMLElement>('.capture-shade').forEach((shade) => shade.classList.add('hidden'));
      tip.querySelector('span')!.textContent = error instanceof Error ? error.message : 'Не удалось сделать снимок';
    }
  });
  const key = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') { window.removeEventListener('keydown', key, true); cleanup(); }
  };
  window.addEventListener('keydown', key, true);
  root.addEventListener('snapmark-cleanup', () => window.removeEventListener('keydown', key, true), { once: true });
}

function setupSelection(root: HTMLElement, image: HTMLImageElement, settings: SnapmarkSettings, exporter: Exporter, cleanup: () => void): void {
  const capture = root.querySelector<HTMLElement>('.capture')!;
  const box = root.querySelector<HTMLElement>('.capture-box')!;
  let start: Point | null = null;
  let crop: Bounds | null = null;
  capture.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    crop = { x: start.x, y: start.y, width: 0, height: 0 };
    box.classList.remove('hidden');
    capture.setPointerCapture(event.pointerId);
  });
  capture.addEventListener('pointermove', (event) => {
    if (!start) return;
    crop = normalizedBounds(start, { x: event.clientX, y: event.clientY });
    updateCaptureBox(box, crop);
  });
  capture.addEventListener('pointerup', (event) => {
    if (!start || !crop) return;
    capture.releasePointerCapture(event.pointerId);
    start = null;
    if (crop.width < 24 || crop.height < 24) { box.classList.add('hidden'); return; }
    const scale = captureScale(image.naturalWidth, image.naturalHeight, window.innerWidth, window.innerHeight);
    const background = cropImage(image, crop, scale.x, scale.y);
    window.removeEventListener('keydown', key, true);
    showEditor(root, background, settings, exporter, cleanup);
  });
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { window.removeEventListener('keydown', key, true); cleanup(); } };
  window.addEventListener('keydown', key, true);
}

function updateCaptureBox(box: HTMLElement, crop: Bounds): void {
  Object.assign(box.style, { left: `${crop.x}px`, top: `${crop.y}px`, width: `${crop.width}px`, height: `${crop.height}px` });
  box.dataset.size = `${Math.round(crop.width)} × ${Math.round(crop.height)}`;
}

function updateCaptureBackdrop(capture: HTMLElement, crop: Bounds): void {
  const setRect = (name: string, x: number, y: number, width: number, height: number) => {
    const shade = capture.querySelector<HTMLElement>(`[data-capture-shade="${name}"]`);
    if (!shade) return;
    shade.classList.remove('hidden');
    Object.assign(shade.style, { left: `${Math.max(0, x)}px`, top: `${Math.max(0, y)}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` });
  };
  setRect('top', 0, 0, window.innerWidth, crop.y);
  setRect('bottom', 0, crop.y + crop.height, window.innerWidth, window.innerHeight - crop.y - crop.height);
  setRect('left', 0, crop.y, crop.x, crop.height);
  setRect('right', crop.x + crop.width, crop.y, window.innerWidth - crop.x - crop.width, crop.height);
}

function showEditor(root: HTMLElement, background: HTMLCanvasElement, settings: SnapmarkSettings, exporter: Exporter, cleanup: () => void, inlineCrop?: Bounds): void {
  root.innerHTML = editorMarkup(settings, Boolean(inlineCrop));
  const canvas = root.querySelector<HTMLCanvasElement>('.canvas')!;
  canvas.width = background.width;
  canvas.height = background.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (inlineCrop) {
    const relayout = () => positionInlineEditor(root, inlineCrop);
    relayout();
    window.addEventListener('resize', relayout);
    root.addEventListener('snapmark-cleanup', () => window.removeEventListener('resize', relayout), { once: true });
  }
  const history = new History<Annotation[]>([]);
  let annotations: Annotation[] = [];
  let selectedId: string | null = null;
  let currentTool: Tool = 'arrow';
  let draft: Annotation | null = null;
  let pointerStart: Point | null = null;
  let movingOriginal: Annotation | null = null;
  let movingLabel = false;
  let resizingLabel: Exclude<LabelHandlePosition, 'move'> | null = null;
  let commentOriginal = '';
  let editingId: string | null = null;
  let exporting = false;

  const render = () => drawScene(ctx, background, draft ? [...annotations.filter((a) => a.id !== draft!.id), draft] : annotations, { selectedId, showSelection: currentTool === 'select' });
  const setAnnotations = (next: Annotation[], push = true) => { annotations = push ? history.push(next) : next; updateHistoryButtons(root, history); render(); };
  const setTool = (tool: Tool) => {
    commitComment();
    currentTool = tool;
    root.querySelectorAll<HTMLElement>('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    root.querySelector<HTMLElement>('.status-main')!.textContent = toolNames[tool];
    render();
  };
  const point = (event: PointerEvent | MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };

  const openComment = (annotation: Annotation, existing = false) => {
    editingId = annotation.id;
    commentOriginal = existing ? annotation.label ?? '' : '';
    const popup = root.querySelector<HTMLElement>('.comment')!;
    const textarea = popup.querySelector<HTMLTextAreaElement>('textarea')!;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvasRect.width / canvas.width;
    const label = labelBounds(annotation, canvas.width, canvas.height);
    const anchor = labelAnchor(annotation);
    const labelX = label?.x ?? anchor.x + 14;
    const labelY = label?.y ?? anchor.y - 10;
    const popupWidth = Math.max(200, Math.min(window.innerWidth - 16, (label?.width ?? 280) * scale));
    const popupHeight = Math.max(132, Math.min(window.innerHeight - 16, (label?.height ?? 158) * scale));
    popup.style.width = `${popupWidth}px`;
    popup.style.height = `${popupHeight}px`;
    popup.style.left = `${Math.min(window.innerWidth - popupWidth - 8, Math.max(8, canvasRect.left + labelX * scale))}px`;
    popup.style.top = `${Math.min(window.innerHeight - popupHeight - 8, Math.max(8, canvasRect.top + labelY * scale))}px`;
    popup.classList.remove('hidden');
    textarea.value = annotation.label ?? '';
    textarea.focus();
  };
  const commitComment = () => {
    if (!editingId) return;
    const popup = root.querySelector<HTMLElement>('.comment')!;
    const value = popup.querySelector<HTMLTextAreaElement>('textarea')!.value;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvas.width / canvasRect.width;
    const rect = popup.getBoundingClientRect();
    const next = annotations.map((a) => a.id === editingId ? withCardAnchor({
      ...a, label: value, labelX: (rect.left - canvasRect.left) * scale, labelY: (rect.top - canvasRect.top) * scale,
      labelWidth: rect.width * scale, labelHeight: rect.height * scale,
    } as Annotation, canvas.width, canvas.height) : a);
    const old = annotations.find((a) => a.id === editingId);
    if (old && (old.label !== value || old.labelX !== next.find((a) => a.id === editingId)?.labelX || old.labelY !== next.find((a) => a.id === editingId)?.labelY || old.labelWidth !== next.find((a) => a.id === editingId)?.labelWidth || old.labelHeight !== next.find((a) => a.id === editingId)?.labelHeight)) setAnnotations(next);
    popup.classList.add('hidden');
    editingId = null;
    canvas.focus();
  };
  const cancelComment = () => {
    if (!editingId) return;
    const next = annotations.map((a) => a.id === editingId ? { ...a, label: commentOriginal } as Annotation : a);
    annotations = next;
    root.querySelector<HTMLElement>('.comment')!.classList.add('hidden');
    editingId = null;
    canvas.focus();
    render();
  };
  const exportAction = async (action: 'copy' | 'save') => {
    if (exporting) return;
    exporting = true;
    root.querySelectorAll<HTMLButtonElement>('[data-action="copy"],[data-action="save"]').forEach((button) => { button.disabled = true; });
    commitComment();
    const data = exportPng(background, annotations);
    try {
      if (action === 'copy' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          const blob = pngDataUrlToBlob(data);
          await Promise.race([
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Clipboard API timeout')), 1500)),
          ]);
        } catch {
          await exporter(action, data, exportFilename());
        }
      } else {
      await exporter(action, data, exportFilename());
      }
      showToast(root, action === 'copy' ? 'PNG скопирован' : 'Открыт выбор папки');
      if (action === 'copy' && settings.copyCloses) setTimeout(cleanup, 260);
      if (action === 'save') setTimeout(cleanup, 260);
    } catch (error) { showToast(root, error instanceof Error ? error.message : 'Не удалось экспортировать'); }
    finally {
      exporting = false;
      root.querySelectorAll<HTMLButtonElement>('[data-action="copy"],[data-action="save"]').forEach((button) => { button.disabled = false; });
    }
  };

  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool as Tool)));
  root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.addEventListener('click', () => { annotations = history.undo(); selectedId = null; updateHistoryButtons(root, history); render(); });
  root.querySelector<HTMLButtonElement>('[data-action="redo"]')!.addEventListener('click', () => { annotations = history.redo(); selectedId = null; updateHistoryButtons(root, history); render(); });
  root.querySelector<HTMLButtonElement>('[data-action="copy"]')!.addEventListener('click', () => void exportAction('copy'));
  root.querySelector<HTMLButtonElement>('[data-action="save"]')!.addEventListener('click', () => void exportAction('save'));
  root.querySelector<HTMLButtonElement>('[data-action="close"]')!.addEventListener('click', cleanup);
  root.querySelector<HTMLButtonElement>('[data-action="delete"]')!.addEventListener('click', () => {
    if (!selectedId) return;
    setAnnotations(annotations.filter((a) => a.id !== selectedId)); selectedId = null;
  });
  root.querySelector<HTMLButtonElement>('[data-action="comment-ok"]')!.addEventListener('click', commitComment);
  const commentHandle = root.querySelector<HTMLElement>('[data-comment-drag]')!;
  const commentResizeHandle = root.querySelector<HTMLElement>('[data-comment-resize]')!;
  let commentDrag: { id: string; pointerX: number; pointerY: number; left: number; top: number } | null = null;
  commentHandle.addEventListener('pointerdown', (event) => {
    if (!editingId || event.button !== 0) return;
    const popup = root.querySelector<HTMLElement>('.comment')!;
    const rect = popup.getBoundingClientRect();
    commentDrag = { id: editingId, pointerX: event.clientX, pointerY: event.clientY, left: rect.left, top: rect.top };
    commentHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  commentHandle.addEventListener('pointermove', (event) => {
    if (!commentDrag) return;
    const popup = root.querySelector<HTMLElement>('.comment')!;
    const left = Math.min(window.innerWidth - popup.offsetWidth - 8, Math.max(8, commentDrag.left + event.clientX - commentDrag.pointerX));
    const top = Math.min(window.innerHeight - popup.offsetHeight - 8, Math.max(8, commentDrag.top + event.clientY - commentDrag.pointerY));
    Object.assign(popup.style, { left: `${left}px`, top: `${top}px` });
  });
  commentHandle.addEventListener('pointerup', (event) => {
    if (!commentDrag) return;
    commentHandle.releasePointerCapture(event.pointerId);
    const popup = root.querySelector<HTMLElement>('.comment')!;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvas.width / canvasRect.width;
    const left = Number.parseFloat(popup.style.left);
    const top = Number.parseFloat(popup.style.top);
    const id = commentDrag.id;
    commentDrag = null;
    setAnnotations(annotations.map((annotation) => annotation.id === id
      ? { ...annotation, labelX: (left - canvasRect.left) * scale, labelY: (top - canvasRect.top) * scale } as Annotation
      : annotation));
  });
  let commentResize: { id: string; pointerX: number; pointerY: number; width: number; height: number } | null = null;
  commentResizeHandle.addEventListener('pointerdown', (event) => {
    if (!editingId || event.button !== 0) return;
    const popup = root.querySelector<HTMLElement>('.comment')!;
    const rect = popup.getBoundingClientRect();
    commentResize = { id: editingId, pointerX: event.clientX, pointerY: event.clientY, width: rect.width, height: rect.height };
    commentResizeHandle.setPointerCapture(event.pointerId);
    event.preventDefault(); event.stopPropagation();
  });
  commentResizeHandle.addEventListener('pointermove', (event) => {
    if (!commentResize) return;
    const popup = root.querySelector<HTMLElement>('.comment')!;
    popup.style.width = `${Math.min(window.innerWidth - popup.getBoundingClientRect().left - 8, Math.max(200, commentResize.width + event.clientX - commentResize.pointerX))}px`;
    popup.style.height = `${Math.min(window.innerHeight - popup.getBoundingClientRect().top - 8, Math.max(132, commentResize.height + event.clientY - commentResize.pointerY))}px`;
  });
  commentResizeHandle.addEventListener('pointerup', (event) => {
    if (!commentResize) return;
    commentResizeHandle.releasePointerCapture(event.pointerId);
    const popup = root.querySelector<HTMLElement>('.comment')!;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvas.width / canvasRect.width;
    const rect = popup.getBoundingClientRect();
    const id = commentResize.id;
    commentResize = null;
    setAnnotations(annotations.map((annotation) => annotation.id === id
      ? { ...annotation, labelWidth: rect.width * scale, labelHeight: rect.height * scale } as Annotation : annotation));
  });
  const colorInput = root.querySelector<HTMLInputElement>('[data-setting="color"]')!;
  const widthInput = root.querySelector<HTMLInputElement>('[data-setting="width"]')!;
  const fillInput = root.querySelector<HTMLInputElement>('[data-setting="fill"]')!;
  colorInput.addEventListener('input', () => { settings.color = colorInput.value.toUpperCase(); root.querySelector<HTMLElement>('.swatch')!.style.background = settings.color; root.querySelector<HTMLElement>('[data-color-value]')!.textContent = settings.color; });
  widthInput.addEventListener('input', () => { settings.lineWidth = Number(widthInput.value); root.querySelector<HTMLElement>('[data-width-value]')!.textContent = `${settings.lineWidth} px`; });
  fillInput.addEventListener('change', () => { settings.shapeFill = fillInput.checked; });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || editingId) return;
    const p = point(event);
    pointerStart = p;
    canvas.setPointerCapture(event.pointerId);
    const handleHit = [...annotations].reverse().map((annotation) => ({ annotation, handle: labelHandleAt(annotation, p, canvas.width, canvas.height) })).find(({ handle }) => handle);
    if (handleHit?.handle === 'move') {
      setTool('select'); selectedId = handleHit.annotation.id; movingOriginal = structuredClone(handleHit.annotation); movingLabel = true; render(); return;
    }
    if (handleHit?.handle) {
      setTool('select'); selectedId = handleHit.annotation.id; movingOriginal = structuredClone(handleHit.annotation); resizingLabel = handleHit.handle; render(); return;
    }
    const labelHit = [...annotations].reverse().find((annotation) => hitTestLabel(annotation, p, canvas.width, canvas.height));
    if (labelHit) {
      setTool('select');
      selectedId = labelHit.id;
      movingOriginal = structuredClone(labelHit);
      movingLabel = true;
      render();
      return;
    }
    if (currentTool === 'select') {
      const hit = [...annotations].reverse().find((annotation) => hitTest(annotation, p));
      selectedId = hit?.id ?? null;
      movingOriginal = hit ? structuredClone(hit) : null;
      render();
      return;
    }
    const base = { id: makeId(), color: settings.color, width: settings.lineWidth };
    if (currentTool === 'pencil') draft = { ...base, tool: 'pencil', points: [p] };
    else if (currentTool === 'text') draft = { ...base, tool: 'text', start: p, end: { x: p.x + 140, y: p.y + 44 }, label: '' };
    else draft = { ...base, tool: currentTool, start: p, end: p, fill: settings.shapeFill } as Annotation;
    selectedId = draft.id;
    render();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerStart) return;
    const p = point(event);
    if (resizingLabel && movingOriginal) {
      draft = resizedLabel(movingOriginal, resizingLabel, p.x - pointerStart.x, p.y - pointerStart.y, canvas.width, canvas.height);
    } else if (movingLabel && movingOriginal) {
      draft = movedLabel(movingOriginal, p.x - pointerStart.x, p.y - pointerStart.y, canvas.width, canvas.height);
    } else if (currentTool === 'select' && selectedId && movingOriginal) {
      draft = moved(movingOriginal, p.x - pointerStart.x, p.y - pointerStart.y);
    } else if (draft?.tool === 'pencil') draft = { ...draft, points: [...draft.points, p] };
    else if (draft) draft = { ...draft, end: p } as Annotation;
    render();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointerStart || editingId) return;
    const p = point(event);
    const hoverHandle = [...annotations].reverse().map((annotation) => labelHandleAt(annotation, p, canvas.width, canvas.height)).find(Boolean);
    const cursorByHandle: Partial<Record<LabelHandlePosition, string>> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize', move: 'move' };
    const overLabel = !hoverHandle && [...annotations].some((annotation) => hitTestLabel(annotation, p, canvas.width, canvas.height));
    canvas.style.cursor = hoverHandle ? cursorByHandle[hoverHandle] ?? 'move' : overLabel ? 'move' : currentTool === 'select' ? 'default' : 'crosshair';
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    canvas.releasePointerCapture(event.pointerId);
    pointerStart = null;
    if (currentTool === 'select' || movingLabel || resizingLabel) {
      if (draft && movingOriginal) setAnnotations(annotations.map((a) => a.id === draft!.id ? draft! : a));
      draft = null; movingOriginal = null; movingLabel = false; resizingLabel = null; return;
    }
    if (draft && isDrawable(draft)) {
      const finished = draft;
      draft = null;
      setAnnotations([...annotations, finished]);
      openComment(finished);
    } else { draft = null; selectedId = null; render(); }
  });
  canvas.addEventListener('dblclick', (event) => {
    const p = point(event);
    const hit = [...annotations].reverse().find((annotation) => hitTestLabel(annotation, p, canvas.width, canvas.height) || hitTest(annotation, p));
    if (hit) { selectedId = hit.id; openComment(hit, true); }
  });

  const textarea = root.querySelector<HTMLTextAreaElement>('.comment textarea')!;
  textarea.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const action = commentKeyAction(event);
    if (action === 'cancel') { event.preventDefault(); cancelComment(); return; }
    if (action === 'newline') {
      event.preventDefault();
      const start = textarea.selectionStart;
      textarea.setRangeText('\n', start, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (action === 'commit') { event.preventDefault(); commitComment(); }
  });
  root.querySelector<HTMLElement>('.editor')!.addEventListener('pointerdown', (event) => {
    if (editingId && !(event.target as HTMLElement).closest('.comment')) commitComment();
  });
  const keydown = (event: KeyboardEvent) => {
    const historyAction = historyKeyAction(event);
    if (historyAction !== 'ignore') {
      event.preventDefault();
      event.stopPropagation();
      // A comment is part of the same editor history as its annotation. Commit
      // the current card first, just like the toolbar Undo button does, so the
      // next undo can reach the annotation that opened the card.
      if (editingId) commitComment();
      annotations = historyAction === 'redo' ? history.redo() : history.undo();
      selectedId = null;
      updateHistoryButtons(root, history);
      render();
      return;
    }
    if (editingId) return;
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void exportAction('save'); return; }
    if (event.key === 'Enter') { event.preventDefault(); void exportAction('copy'); return; }
    if (event.key === 'Escape') { event.preventDefault(); if (selectedId) { selectedId = null; render(); } else cleanup(); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) { event.preventDefault(); setAnnotations(annotations.filter((a) => a.id !== selectedId)); selectedId = null; }
    const shortcuts: Partial<Record<string, Tool>> = { v: 'select', a: 'arrow', r: 'rect', o: 'ellipse', p: 'pencil', t: 'text' };
    if (!event.ctrlKey && !event.metaKey && shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]!);
  };
  window.addEventListener('keydown', keydown, true);
  root.addEventListener('snapmark-cleanup', () => window.removeEventListener('keydown', keydown, true));
  updateHistoryButtons(root, history);
  setTool('arrow');
  render();
}

function editorMarkup(settings: SnapmarkSettings, inlineMode = false): string {
  const toolButton = (tool: Tool, shortcut: string) => `<button type="button" class="ib" data-tool="${tool}" data-tooltip="${toolNames[tool]} · ${shortcut}" title="${toolNames[tool]} (${shortcut})" aria-label="${toolNames[tool]}">${icon(tool)}</button>`;
  const actionButton = (action: string, name: 'undo' | 'redo' | 'copy' | 'save' | 'close' | 'trash', tooltip: string, extra = '') => `<button type="button" class="ib ${extra}" data-action="${action}" data-tooltip="${tooltip}" title="${tooltip}" aria-label="${tooltip}">${icon(name)}</button>`;
  const settingsMarkup = `<div class="top-settings"><span class="swatch" style="background:${settings.color}"><input data-setting="color" aria-label="Цвет аннотации" type="color" value="${settings.color}"></span><span class="value" data-color-value>${settings.color}</span><input class="range" data-setting="width" aria-label="Толщина линии" type="range" min="2" max="10" value="${settings.lineWidth}"><span class="value" data-width-value>${settings.lineWidth} px</span><label class="check" title="Заливка фигур · 12%"><input data-setting="fill" type="checkbox" ${settings.shapeFill ? 'checked' : ''}><span>Заливка</span></label></div>`;
  const masks = inlineMode ? '<div class="mask" data-mask="top"></div><div class="mask" data-mask="left"></div><div class="mask" data-mask="right"></div><div class="mask" data-mask="bottom"></div>' : '';
  return `<div class="editor ${inlineMode ? 'inline-editor' : ''}">${masks}
    <header class="topbar"><div class="brand"><i class="brandmark"></i><span>Snapmark</span></div>${inlineMode ? settingsMarkup + '<div class="divider-v"></div>' : ''}${actionButton('undo','undo','Отменить · Ctrl+Z')}${actionButton('redo','redo','Повторить · Ctrl+Shift+Z / Ctrl+Y')}<div class="spacer"></div>${actionButton('copy','copy','Копировать PNG · Enter','primary')}${actionButton('save','save','Сохранить как… · Ctrl+S')}${actionButton('close','close','Закрыть · Esc')}</header>
    <aside class="toolstrip">${toolButton('select','V')}${toolButton('arrow','A')}${toolButton('rect','R')}${toolButton('ellipse','O')}${toolButton('pencil','P')}${toolButton('text','T')}<div class="divider"></div>${actionButton('delete','trash','Удалить · Delete','danger')}</aside>
    <main class="stage"><div class="canvas-wrap"><canvas class="canvas" tabindex="0"></canvas></div></main>
    ${inlineMode ? '' : `<aside class="props"><h3>Стиль аннотации</h3><div class="field"><label>Цвет</label><div class="inline"><span class="swatch" style="background:${settings.color}"><input data-setting="color" type="color" value="${settings.color}"></span><span class="value" data-color-value>${settings.color}</span></div></div><div class="field"><label>Толщина</label><input class="range" data-setting="width" type="range" min="2" max="10" value="${settings.lineWidth}"><span class="value" data-width-value>${settings.lineWidth} px</span></div><div class="field"><label class="check"><input data-setting="fill" type="checkbox" ${settings.shapeFill ? 'checked' : ''}>Заливка фигур · 12%</label></div><div class="hint-card"><strong>Enter</strong> — применить комментарий<br><strong>Shift/Ctrl+Enter</strong> — новая строка<br><strong>Enter</strong> вне поля — копировать PNG</div></aside>`}
    <footer class="status"><span class="status-main">Стрелка</span><span class="push">Двойной клик — изменить подпись · Esc — отмена/закрыть</span></footer>
    <div class="comment hidden"><div class="comment-head" data-comment-drag title="Перетащить комментарий"><span>${icon('grip')}</span><span>Связано с аннотацией · перетащите</span></div><textarea placeholder="Добавьте комментарий…" aria-label="Комментарий"></textarea><div class="comment-foot"><span>Новая строка · Shift/Ctrl+Enter</span><button type="button" class="ib primary" data-action="comment-ok" data-tooltip="Готово · Enter" title="Готово (Enter)" aria-label="Готово">${icon('check')}</button></div><div class="comment-resize" data-comment-resize title="Изменить размер комментария" aria-label="Изменить размер комментария"></div></div>
  </div>`;
}

function positionInlineEditor(root: HTMLElement, crop: Bounds): void {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const setRect = (element: HTMLElement | null, x: number, y: number, width: number, height: number) => {
    if (!element) return;
    Object.assign(element.style, { left: `${Math.max(0, x)}px`, top: `${Math.max(0, y)}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` });
  };
  setRect(root.querySelector<HTMLElement>('.stage'), crop.x, crop.y, crop.width, crop.height);
  setRect(root.querySelector<HTMLElement>('[data-mask="top"]'), 0, 0, viewportWidth, crop.y);
  setRect(root.querySelector<HTMLElement>('[data-mask="bottom"]'), 0, crop.y + crop.height, viewportWidth, viewportHeight - crop.y - crop.height);
  setRect(root.querySelector<HTMLElement>('[data-mask="left"]'), 0, crop.y, crop.x, crop.height);
  setRect(root.querySelector<HTMLElement>('[data-mask="right"]'), crop.x + crop.width, crop.y, viewportWidth - crop.x - crop.width, crop.height);
  const topbar = root.querySelector<HTMLElement>('.topbar')!;
  const toolbar = root.querySelector<HTMLElement>('.toolstrip')!;
  const status = root.querySelector<HTMLElement>('.status')!;
  const topbarWidth = Math.min(topbar.offsetWidth, viewportWidth - 16);
  const topbarLeft = Math.min(Math.max(8, crop.x), Math.max(8, viewportWidth - topbarWidth - 8));
  const topbarTop = crop.y >= 50 ? crop.y - 48 : Math.min(viewportHeight - 50, crop.y + 8);
  Object.assign(topbar.style, { left: `${topbarLeft}px`, top: `${Math.max(8, topbarTop)}px` });
  const toolbarLeft = crop.x >= 50 ? crop.x - 48 : crop.x + 8;
  const toolbarTop = Math.min(Math.max(8, crop.y), Math.max(8, viewportHeight - toolbar.offsetHeight - 8));
  Object.assign(toolbar.style, { left: `${Math.max(8, toolbarLeft)}px`, top: `${toolbarTop}px` });
  const statusTop = crop.y + crop.height + 6 + 24 <= viewportHeight ? crop.y + crop.height + 6 : Math.max(8, crop.y + crop.height - 30);
  Object.assign(status.style, { left: `${Math.min(Math.max(8, crop.x), viewportWidth - 110)}px`, top: `${statusTop}px` });
}

function updateHistoryButtons(root: HTMLElement, history: History<Annotation[]>): void {
  root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !history.canUndo;
  root.querySelector<HTMLButtonElement>('[data-action="redo"]')!.disabled = !history.canRedo;
}

function showToast(root: HTMLElement, text: string): void {
  root.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  root.querySelector('.editor')?.append(toast);
  setTimeout(() => toast.remove(), 2200);
}

function pngDataUrlToBlob(dataUrl: string): Blob {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: 'image/png' });
}
