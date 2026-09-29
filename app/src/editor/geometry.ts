import type { Annotation, Bounds, LabelAnchorSide, Point } from '../shared';

export const LABEL_MIN_WIDTH = 120;
export const LABEL_MIN_HEIGHT = 54;
const LABEL_HORIZONTAL_PADDING = 22;
const LABEL_VERTICAL_PADDING = 14;
const LABEL_LINE_HEIGHT = 20;
const LABEL_CHAR_WIDTH = 8.5;

export type LabelLayout = { bounds: Bounds; lines: string[] };
export type LabelHandlePosition = 'nw' | 'n' | 'ne' | 'w' | 'move' | 'e' | 'sw' | 's' | 'se';
export type LabelHandle = { position: LabelHandlePosition; bounds: Bounds };

export function wrapLabelLines(text: string, contentWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(contentWidth / LABEL_CHAR_WIDTH));
  return text.split('\n').flatMap((paragraph) => {
    if (!paragraph) return [''];
    const words = paragraph.split(/\s+/).flatMap((word) => word.length <= maxChars
      ? [word]
      : Array.from({ length: Math.ceil(word.length / maxChars) }, (_, index) => word.slice(index * maxChars, (index + 1) * maxChars)));
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (!line) { line = word; continue; }
      if (`${line} ${word}`.length <= maxChars) line = `${line} ${word}`;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines;
  });
}

export function normalizedBounds(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function captureScale(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number): { x: number; y: number } {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) throw new Error('Capture and viewport dimensions must be positive');
  return { x: imageWidth / viewportWidth, y: imageHeight / viewportHeight };
}

export function boundsOf(annotation: Annotation): Bounds {
  if (annotation.tool === 'pencil') {
    const xs = annotation.points.map((p) => p.x);
    const ys = annotation.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  if (annotation.tool === 'text') {
    const b = normalizedBounds(annotation.start, annotation.end);
    return { ...b, width: Math.max(80, b.width), height: Math.max(34, b.height) };
  }
  return normalizedBounds(annotation.start, annotation.end);
}

export function labelLayout(annotation: Annotation, canvasWidth: number, canvasHeight: number): LabelLayout | null {
  const label = annotation.label?.trim();
  if (!label) return null;
  const unwrapped = label.split('\n');
  const naturalWidth = Math.max(...unwrapped.map((line) => line.length * LABEL_CHAR_WIDTH)) + LABEL_HORIZONTAL_PADDING;
  const width = Math.max(LABEL_MIN_WIDTH, annotation.labelWidth ?? naturalWidth);
  const lines = wrapLabelLines(label, width - LABEL_HORIZONTAL_PADDING);
  const naturalHeight = Math.max(LABEL_MIN_HEIGHT, lines.length * LABEL_LINE_HEIGHT + LABEL_VERTICAL_PADDING);
  const height = Math.max(naturalHeight, annotation.labelHeight ?? 0);
  const anchor = labelAnchor(annotation);
  const preferredX = annotation.labelX ?? anchor.x + 14;
  const preferredY = annotation.labelY ?? anchor.y - 10;
  return { bounds: {
    x: Math.min(Math.max(8, preferredX), Math.max(8, canvasWidth - width - 8)),
    y: Math.min(Math.max(8, preferredY), Math.max(8, canvasHeight - height - 8)), width, height,
  }, lines };
}

export function labelBounds(annotation: Annotation, canvasWidth: number, canvasHeight: number): Bounds | null {
  return labelLayout(annotation, canvasWidth, canvasHeight)?.bounds ?? null;
}

export function labelAnchor(annotation: Annotation): Point {
  if (annotation.tool === 'arrow') return annotation.start;
  if (annotation.tool === 'pencil') return annotation.points[annotation.points.length - 1] ?? { x: 0, y: 0 };
  if (annotation.tool === 'text') return annotation.start;
  const shape = boundsOf(annotation);
  return { x: shape.x + shape.width, y: shape.y + shape.height / 2 };
}

export type CardAnchor = { side: LabelAnchorSide; ratio: number; point: Point };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Keeps a comment arrow attached to the same side of its card. Legacy annotations
 * derive that side from the old arrow tail, so opening an existing screenshot does
 * not make its connector jump.
 */
export function cardAnchor(annotation: Annotation, canvasWidth: number, canvasHeight: number): CardAnchor | null {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return null;
  const legacy = labelAnchor(annotation);
  const distances: Array<[LabelAnchorSide, number]> = [
    ['top', Math.abs(legacy.y - label.y)], ['right', Math.abs(legacy.x - (label.x + label.width))],
    ['bottom', Math.abs(legacy.y - (label.y + label.height))], ['left', Math.abs(legacy.x - label.x)],
  ];
  const side = annotation.labelAnchorSide ?? distances.reduce((closest, item) => item[1] < closest[1] ? item : closest)[0];
  const ratio = clamp(annotation.labelAnchorRatio ?? (side === 'top' || side === 'bottom'
    ? (legacy.x - label.x) / label.width : (legacy.y - label.y) / label.height), 0, 1);
  const point = side === 'top' ? { x: label.x + label.width * ratio, y: label.y }
    : side === 'right' ? { x: label.x + label.width, y: label.y + label.height * ratio }
      : side === 'bottom' ? { x: label.x + label.width * ratio, y: label.y + label.height }
        : { x: label.x, y: label.y + label.height * ratio };
  return { side, ratio, point };
}

export function withCardAnchor(annotation: Annotation, canvasWidth: number, canvasHeight: number): Annotation {
  const anchor = cardAnchor(annotation, canvasWidth, canvasHeight);
  return anchor ? { ...annotation, labelAnchorSide: anchor.side, labelAnchorRatio: anchor.ratio } as Annotation : annotation;
}

function expanded(bounds: Bounds, padding: number): Bounds {
  return { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
}

function segmentIntersectsBounds(a: Point, b: Point, box: Bounds): boolean {
  const dx = b.x - a.x; const dy = b.y - a.y;
  let from = 0; let to = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const value = q / p;
    if (p < 0) { if (value > to) return false; if (value > from) from = value; }
    else { if (value < from) return false; if (value < to) to = value; }
    return true;
  };
  return clip(-dx, a.x - box.x) && clip(dx, box.x + box.width - a.x)
    && clip(-dy, a.y - box.y) && clip(dy, box.y + box.height - a.y)
    // Mere contact at an endpoint is allowed; travelling through the safe area is not.
    && from < to && to > 0.0001 && from < 0.9999;
}

/** Returns a short visibility route around other comment cards and their safe area. */
export function commentArrowRoute(annotation: Annotation, annotations: Annotation[], canvasWidth: number, canvasHeight: number, padding = 16): Point[] | null {
  if (annotation.tool !== 'arrow' || !annotation.label?.trim()) return null;
  const anchor = cardAnchor(annotation, canvasWidth, canvasHeight);
  if (!anchor) return null;
  const obstacles = annotations.filter((item) => item.id !== annotation.id && item.label?.trim())
    .map((item) => labelBounds(item, canvasWidth, canvasHeight)).filter((item): item is Bounds => Boolean(item)).map((item) => expanded(item, padding));
  const nodes: Point[] = [anchor.point, annotation.end];
  const clearance = 2;
  obstacles.forEach((box) => nodes.push(
    { x: box.x - clearance, y: box.y - clearance }, { x: box.x + box.width + clearance, y: box.y - clearance },
    { x: box.x + box.width + clearance, y: box.y + box.height + clearance }, { x: box.x - clearance, y: box.y + box.height + clearance },
  ));
  const distances = nodes.map(() => Infinity); const previous = nodes.map(() => -1); const visited = nodes.map(() => false);
  distances[0] = 0;
  for (let step = 0; step < nodes.length; step += 1) {
    let current = -1;
    for (let i = 0; i < nodes.length; i += 1) if (!visited[i]! && (current < 0 || distances[i]! < distances[current]!)) current = i;
    if (current < 0 || current === 1) break;
    visited[current] = true;
    for (let next = 0; next < nodes.length; next += 1) {
      if (next === current || visited[next] || obstacles.some((box) => segmentIntersectsBounds(nodes[current]!, nodes[next]!, box))) continue;
      const candidate = distances[current]! + Math.hypot(nodes[current]!.x - nodes[next]!.x, nodes[current]!.y - nodes[next]!.y);
      if (candidate < distances[next]!) { distances[next] = candidate; previous[next] = current; }
    }
  }
  if (!Number.isFinite(distances[1])) return [anchor.point, annotation.end];
  const route: Point[] = [];
  for (let cursor = 1; cursor >= 0; cursor = previous[cursor]!) { route.unshift(nodes[cursor]!); if (cursor === 0) break; }
  return route;
}

export function hitTestLabel(annotation: Annotation, point: Point, canvasWidth: number, canvasHeight: number, tolerance = 5): boolean {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return false;
  return point.x >= label.x - tolerance && point.x <= label.x + label.width + tolerance
    && point.y >= label.y - tolerance && point.y <= label.y + label.height + tolerance;
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTest(annotation: Annotation, p: Point, tolerance = 10): boolean {
  if (annotation.tool === 'arrow') return pointToSegmentDistance(p, annotation.start, annotation.end) <= tolerance;
  const b = boundsOf(annotation);
  if (annotation.tool === 'pencil') {
    return annotation.points.some((point, index) => index > 0 && pointToSegmentDistance(p, annotation.points[index - 1]!, point) <= tolerance);
  }
  return p.x >= b.x - tolerance && p.x <= b.x + b.width + tolerance && p.y >= b.y - tolerance && p.y <= b.y + b.height + tolerance;
}

export function moved(annotation: Annotation, dx: number, dy: number): Annotation {
  if (annotation.tool === 'pencil') {
    return {
      ...annotation,
      points: annotation.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      labelX: annotation.labelX == null ? undefined : annotation.labelX + dx,
      labelY: annotation.labelY == null ? undefined : annotation.labelY + dy,
    };
  }
  return {
    ...annotation,
    start: { x: annotation.start.x + dx, y: annotation.start.y + dy },
    end: { x: annotation.end.x + dx, y: annotation.end.y + dy },
    labelX: annotation.labelX == null ? undefined : annotation.labelX + dx,
    labelY: annotation.labelY == null ? undefined : annotation.labelY + dy,
  } as Annotation;
}

export function movedLabel(annotation: Annotation, dx: number, dy: number, canvasWidth: number, canvasHeight: number): Annotation {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return annotation;
  return { ...annotation, labelX: label.x + dx, labelY: label.y + dy } as Annotation;
}

export function labelResizeHandleBounds(annotation: Annotation, canvasWidth: number, canvasHeight: number): Bounds | null {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  return label ? { x: label.x + label.width - 2, y: label.y + label.height - 2, width: 16, height: 16 } : null;
}

export function labelHandles(annotation: Annotation, canvasWidth: number, canvasHeight: number): LabelHandle[] {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return [];
  const x = label.x - 4;
  const y = label.y - 4;
  const right = label.x + label.width + 4;
  const bottom = label.y + label.height + 4;
  const middleX = (x + right) / 2;
  const middleY = (y + bottom) / 2;
  const points: Array<[LabelHandlePosition, number, number]> = [
    ['nw', x, y], ['n', middleX, y], ['ne', right, y],
    ['w', x, middleY], ['move', middleX, middleY], ['e', right, middleY],
    ['sw', x, bottom], ['s', middleX, bottom], ['se', right, bottom],
  ];
  return points.map(([position, handleX, handleY]) => ({ position, bounds: { x: handleX - 5, y: handleY - 5, width: 10, height: 10 } }));
}

export function labelHandleAt(annotation: Annotation, point: Point, canvasWidth: number, canvasHeight: number): LabelHandlePosition | null {
  const handle = labelHandles(annotation, canvasWidth, canvasHeight).find(({ bounds }) => point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height);
  return handle?.position ?? null;
}

export function hitTestLabelResize(annotation: Annotation, point: Point, canvasWidth: number, canvasHeight: number): boolean {
  const handle = labelHandleAt(annotation, point, canvasWidth, canvasHeight);
  return Boolean(handle && handle !== 'move');
}

export function resizedLabel(annotation: Annotation, handle: Exclude<LabelHandlePosition, 'move'>, dx: number, dy: number, canvasWidth: number, canvasHeight: number): Annotation {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return annotation;
  const isLeft = handle.includes('w');
  const isRight = handle.includes('e');
  const isTop = handle.includes('n');
  const isBottom = handle.includes('s');
  const right = label.x + label.width;
  const bottom = label.y + label.height;
  const width = Math.max(LABEL_MIN_WIDTH, isLeft ? label.width - dx : isRight ? label.width + dx : label.width);
  const height = Math.max(LABEL_MIN_HEIGHT, isTop ? label.height - dy : isBottom ? label.height + dy : label.height);
  const x = Math.max(8, Math.min(isLeft ? right - width : label.x, canvasWidth - width - 8));
  const y = Math.max(8, Math.min(isTop ? bottom - height : label.y, canvasHeight - height - 8));
  return {
    ...annotation,
    labelX: x,
    labelY: y,
    labelWidth: Math.min(width, canvasWidth - x - 8),
    labelHeight: Math.min(height, canvasHeight - y - 8),
  } as Annotation;
}

export function isDrawable(annotation: Annotation): boolean {
  const b = boundsOf(annotation);
  return annotation.tool === 'pencil' ? annotation.points.length > 1 : annotation.tool === 'text' || b.width + b.height >= 8;
}
