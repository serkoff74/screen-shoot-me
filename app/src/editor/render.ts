import type { Annotation, Bounds, Point } from '../shared';
import { UI_BLUE } from '../shared';
import { boundsOf, commentArrowRoute, labelBounds, labelHandles, labelLayout } from './geometry';

export type RenderOptions = { selectedId?: string | null; showSelection?: boolean };

function pathPencil(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = { x: (points[i]!.x + points[i + 1]!.x) / 2, y: (points[i]!.y + points[i + 1]!.y) / 2 };
    ctx.quadraticCurveTo(points[i]!.x, points[i]!.y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last!.x, last!.y);
}

function shapePath(ctx: CanvasRenderingContext2D, annotation: Annotation, annotations: Annotation[]): void {
  if (annotation.tool === 'pencil') {
    pathPencil(ctx, annotation.points);
    return;
  }
  if (annotation.tool === 'text') return;
  const b = boundsOf(annotation);
  ctx.beginPath();
  if (annotation.tool === 'rect') ctx.roundRect(b.x, b.y, b.width, b.height, Math.min(8, b.width / 4, b.height / 4));
  if (annotation.tool === 'ellipse') ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
  if (annotation.tool === 'arrow') {
    const route = commentArrowRoute(annotation, annotations, ctx.canvas.width, ctx.canvas.height);
    const points = route ?? [annotation.start, annotation.end];
    const start = points[0]!; const end = points[points.length - 1]!;
    const beforeEnd = points[points.length - 2] ?? start;
    const angle = Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x);
    const head = Math.max(14, annotation.width * 4);
    ctx.moveTo(start.x, start.y);
    if (points.length === 2) ctx.lineTo(end.x, end.y);
    else {
      for (let index = 1; index < points.length - 1; index += 1) {
        const current = points[index]!; const next = points[index + 1]!;
        ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
      }
      ctx.lineTo(end.x, end.y);
    }
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
  }
}

function contrastHalo(ctx: CanvasRenderingContext2D, annotation: Annotation): string {
  const b = boundsOf(annotation);
  const x = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(b.x + b.width / 2)));
  const y = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(b.y + b.height / 2)));
  try {
    const [r = 255, g = 255, bl = 255] = ctx.getImageData(x, y, 1, 1).data;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;
    return luminance > 0.55 ? 'rgba(15,23,42,.88)' : 'rgba(255,255,255,.92)';
  } catch {
    return 'rgba(255,255,255,.92)';
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
  const label = annotation.label?.trim();
  if (!label) return;
  const layout = labelLayout(annotation, ctx.canvas.width, ctx.canvas.height);
  if (!layout) return;
  const { bounds: labelBox, lines } = layout;
  ctx.save();
  ctx.font = '600 15px Inter, system-ui, sans-serif';
  const { x, y, width, height } = labelBox;
  ctx.fillStyle = 'rgba(20,28,42,.94)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  const visibleLineCount = Math.max(1, Math.floor((height - 14) / 20));
  const visibleLines = lines.slice(0, visibleLineCount);
  if (visibleLines.length < lines.length) visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1]!.replace(/…$/, '').slice(0, -1)}…`;
  visibleLines.forEach((line, index) => ctx.fillText(line, x + 11, y + 21 + index * 20));
  ctx.restore();
}

function drawAnnotation(ctx: CanvasRenderingContext2D, annotation: Annotation, annotations: Annotation[]): void {
  if (annotation.tool === 'text') {
    drawLabel(ctx, annotation);
    return;
  }
  const halo = contrastHalo(ctx, annotation);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  shapePath(ctx, annotation, annotations);
  ctx.strokeStyle = halo;
  ctx.lineWidth = annotation.width + 4;
  ctx.stroke();
  shapePath(ctx, annotation, annotations);
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = annotation.width;
  ctx.stroke();
  if ((annotation.tool === 'rect' || annotation.tool === 'ellipse') && annotation.fill) {
    shapePath(ctx, annotation, annotations);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = annotation.color;
    ctx.fill();
  }
  ctx.restore();
  drawLabel(ctx, annotation);
}

function drawSelection(ctx: CanvasRenderingContext2D, bounds: Bounds): void {
  const pad = 5;
  const x = bounds.x - pad;
  const y = bounds.y - pad;
  const w = Math.max(10, bounds.width + pad * 2);
  const h = Math.max(10, bounds.height + pad * 2);
  ctx.save();
  ctx.strokeStyle = UI_BLUE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  const handles: Array<[number, number]> = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  for (const [hx, hy] of handles) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = UI_BLUE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(hx - 4, hy - 4, 8, 8);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabelSelection(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
  const label = labelBounds(annotation, ctx.canvas.width, ctx.canvas.height);
  if (!label) return;
  ctx.save();
  ctx.strokeStyle = UI_BLUE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(label.x - 4, label.y - 4, label.width + 8, label.height + 8);
  ctx.setLineDash([]);
  ctx.fillStyle = UI_BLUE;
  ctx.font = '600 10px Inter, system-ui, sans-serif';
  ctx.fillText('Комментарий · 8 сторон — размер, центр — перенос', label.x, Math.max(12, label.y - 8));
  for (const handle of labelHandles(annotation, ctx.canvas.width, ctx.canvas.height)) {
    ctx.fillStyle = handle.position === 'move' ? UI_BLUE : '#fff';
    ctx.strokeStyle = UI_BLUE;
    ctx.lineWidth = 1.5;
    ctx.fillRect(handle.bounds.x, handle.bounds.y, handle.bounds.width, handle.bounds.height);
    ctx.strokeRect(handle.bounds.x, handle.bounds.y, handle.bounds.width, handle.bounds.height);
  }
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, background: HTMLCanvasElement, annotations: Annotation[], options: RenderOptions = {}): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(background, 0, 0, ctx.canvas.width, ctx.canvas.height);
  annotations.forEach((annotation) => drawAnnotation(ctx, annotation, annotations));
  if (options.showSelection && options.selectedId) {
    const selected = annotations.find((item) => item.id === options.selectedId);
    if (selected) {
      drawSelection(ctx, boundsOf(selected));
      drawLabelSelection(ctx, selected);
    }
  }
}

export function exportPng(background: HTMLCanvasElement, annotations: Annotation[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = background.width;
  canvas.height = background.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D недоступен');
  drawScene(ctx, background, annotations);
  return canvas.toDataURL('image/png');
}

export async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

export function cropImage(image: HTMLImageElement, crop: Bounds, scaleX: number, scaleY: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width * scaleX));
  canvas.height = Math.max(1, Math.round(crop.height * scaleY));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен');
  ctx.drawImage(image, crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY, 0, 0, canvas.width, canvas.height);
  return canvas;
}
