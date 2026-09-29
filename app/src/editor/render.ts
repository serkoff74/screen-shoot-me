import type { Annotation, Bounds, Point } from '../shared';
import { UI_BLUE } from '../shared';
import { boundsOf, cardPorts, commentArrowRoute, commentLeaderRoute, LABEL_HANDLE_PADDING, LABEL_HANDLE_SIZE, labelBounds, labelLayout, SHAPE_HANDLE_PADDING, shapeHandles } from './geometry';

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

/**
 * Dashed coral leader with a dashed contrast halo that ties a shape's comment
 * card to the shape itself, bending around other comment cards.
 */
function drawCommentLeader(ctx: CanvasRenderingContext2D, annotation: Annotation, annotations: Annotation[]): void {
  const route = commentLeaderRoute(annotation, annotations, ctx.canvas.width, ctx.canvas.height);
  if (!route || route.length < 2) return;
  const halo = contrastHalo(ctx, annotation);
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(route[0]!.x, route[0]!.y);
    if (route.length === 2) { ctx.lineTo(route[1]!.x, route[1]!.y); return; }
    for (let index = 1; index < route.length - 1; index += 1) {
      const current = route[index]!; const next = route[index + 1]!;
      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    const last = route[route.length - 1]!;
    ctx.lineTo(last.x, last.y);
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([7, 6]);
  trace(); ctx.strokeStyle = halo; ctx.lineWidth = 5; ctx.stroke();
  trace(); ctx.strokeStyle = annotation.color; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([]);
  // Coral anchor dot where the leader meets the shape.
  const anchor = route[0]!;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = annotation.color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = halo;
  ctx.stroke();
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
  drawCommentLeader(ctx, annotation, annotations);
  drawLabel(ctx, annotation);
}

function drawSelection(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
  // Text is only a comment card and an arrow is edited by dragging its tip, so
  // neither gets a bounding-box resize frame.
  if (annotation.tool === 'text' || annotation.tool === 'arrow') return;
  const bounds = boundsOf(annotation);
  const pad = SHAPE_HANDLE_PADDING;
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
  // Eight handles so the selection advertises resize in every direction.
  for (const handle of shapeHandles(annotation)) {
    const { x: hx, y: hy, width: hw, height: hh } = handle.bounds;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = UI_BLUE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(hx, hy, hw, hh);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export type RenderOptions = {
  selectedId?: string | null;
  showSelection?: boolean;
  /** Annotation id whose ports should be shown in hover state (non-selected card) */
  hoverAnnotationId?: string | null;
  /** Port index (0-7) currently under the cursor; -1 or null = none */
  hoverPortIndex?: number | null;
};

/**
 * Draws the 8 connection ports on the border of a comment card.
 *
 * Ports whose centre falls exactly on the card boundary.  The hovered port
 * is rendered slightly larger and with a blue stroke so it is easy to grab.
 *
 * @param isSelected - when true the ports are always visible;
 *                     when false they are drawn semi-transparent (hover state)
 */
function drawCardPorts(ctx: CanvasRenderingContext2D, annotation: Annotation, hoverPortIndex: number | null | undefined, isSelected: boolean): void {
  const ports = cardPorts(annotation, ctx.canvas.width, ctx.canvas.height);
  if (!ports.length) return;
  ctx.save();
  const baseAlpha = isSelected ? 1 : 0.65;
  for (let i = 0; i < ports.length; i += 1) {
    const p = ports[i]!;
    const isHovered = hoverPortIndex === i;
    const r = isHovered ? 6 : 4;
    ctx.globalAlpha = isHovered ? 1 : baseAlpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isHovered ? UI_BLUE : '#fff';
    ctx.fill();
    ctx.strokeStyle = UI_BLUE;
    ctx.lineWidth = isHovered ? 2 : 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws the selection chrome for a comment card:
 * – outer dashed frame 10 px outside the card with 8 square resize handles
 * – port circles on the card boundary
 */
function drawLabelSelection(ctx: CanvasRenderingContext2D, annotation: Annotation, hoverPortIndex: number | null | undefined): void {
  const label = labelBounds(annotation, ctx.canvas.width, ctx.canvas.height);
  if (!label) return;

  const pad = LABEL_HANDLE_PADDING; // gap between card edge and outer dashed frame
  const fx = label.x - pad;
  const fy = label.y - pad;
  const fw = label.width + pad * 2;
  const fh = label.height + pad * 2;

  ctx.save();

  // --- Outer dashed frame ---
  ctx.strokeStyle = UI_BLUE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.setLineDash([]);

  // --- 8 square resize handles centred on the outer frame ---
  const hs = LABEL_HANDLE_SIZE;
  const hh = hs / 2;
  const frameHandlePositions: Array<[number, number]> = [
    [fx, fy], [fx + fw / 2, fy], [fx + fw, fy],
    [fx + fw, fy + fh / 2],
    [fx + fw, fy + fh], [fx + fw / 2, fy + fh], [fx, fy + fh],
    [fx, fy + fh / 2],
  ];
  for (const [hx, hy] of frameHandlePositions) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(hx - hh, hy - hh, hs, hs);
    ctx.strokeStyle = UI_BLUE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hx - hh, hy - hh, hs, hs);
  }

  ctx.restore();

  // --- Port circles on the card boundary (always visible when selected) ---
  drawCardPorts(ctx, annotation, hoverPortIndex, true);
}

export function drawScene(ctx: CanvasRenderingContext2D, background: HTMLCanvasElement, annotations: Annotation[], options: RenderOptions = {}): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(background, 0, 0, ctx.canvas.width, ctx.canvas.height);
  annotations.forEach((annotation) => drawAnnotation(ctx, annotation, annotations));
  if (options.showSelection && options.selectedId) {
    const selected = annotations.find((item) => item.id === options.selectedId);
    if (selected) {
      drawSelection(ctx, selected);
      drawLabelSelection(ctx, selected, options.hoverPortIndex);
    }
  }
  // Hover ports on non-selected cards
  if (options.hoverAnnotationId && options.hoverAnnotationId !== options.selectedId) {
    const hovered = annotations.find((item) => item.id === options.hoverAnnotationId);
    if (hovered) drawCardPorts(ctx, hovered, options.hoverPortIndex, false);
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
