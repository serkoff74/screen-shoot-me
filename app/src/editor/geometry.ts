import type { Annotation, Bounds, LabelAnchorSide, Point } from '../shared';

export const LABEL_MIN_WIDTH = 120;
export const LABEL_MIN_HEIGHT = 54;
export const LABEL_MAX_AUTO_HEIGHT = 240;
/** Distance between the card border and the resize-handle frame. */
export const LABEL_HANDLE_PADDING = 10;
/** Side length of a square resize handle. */
export const LABEL_HANDLE_SIZE = 9;
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
  const hasManualHeight = annotation.labelHeightManual ?? annotation.labelHeight != null;
  // A manually chosen height is authoritative; long text remains editable in
  // the scrollable field instead of silently expanding the card again.
  const height = hasManualHeight ? Math.max(LABEL_MIN_HEIGHT, annotation.labelHeight ?? 0) : Math.min(LABEL_MAX_AUTO_HEIGHT, naturalHeight);
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

/**
 * Resolves the start point of an arrow. Child arrows are owned by a comment
 * card and leave it through a normalised port, so their start is derived from
 * the owner's current bounds instead of a stored coordinate.
 */
export function arrowStart(annotation: Annotation, annotations: Annotation[], canvasWidth: number, canvasHeight: number): Point {
  if (annotation.tool !== 'arrow') return (annotation as { start: Point }).start;
  if (annotation.cardOwnerId && annotation.cardPortX != null && annotation.cardPortY != null) {
    const owner = annotations.find((item) => item.id === annotation.cardOwnerId);
    const port = owner ? cardPortPoint(owner, annotation.cardPortX, annotation.cardPortY, canvasWidth, canvasHeight) : null;
    if (port) return port;
  }
  return annotation.start;
}

/** Returns a short visibility route around other comment cards and their safe area. */
export function commentArrowRoute(annotation: Annotation, annotations: Annotation[], canvasWidth: number, canvasHeight: number, padding = 16): Point[] | null {
  if (annotation.tool !== 'arrow') return null;
  const ownerId = annotation.cardOwnerId;
  let start: Point | null;
  let excludedId = annotation.id;
  if (ownerId) {
    // The owner card is where the arrow leaves from, so it is not an obstacle.
    start = arrowStart(annotation, annotations, canvasWidth, canvasHeight);
    excludedId = ownerId;
  } else {
    if (!annotation.label?.trim()) return null;
    start = cardAnchor(annotation, canvasWidth, canvasHeight)?.point ?? null;
  }
  if (!start) return null;
  const obstacles = annotations.filter((item) => item.id !== annotation.id && item.id !== excludedId && item.label?.trim())
    .map((item) => labelBounds(item, canvasWidth, canvasHeight)).filter((item): item is Bounds => Boolean(item)).map((item) => expanded(item, padding));
  const nodes: Point[] = [start, annotation.end];
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
  if (!Number.isFinite(distances[1])) return [start, annotation.end];
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
  return labelHandles(annotation, canvasWidth, canvasHeight).find(({ position }) => position === 'se')?.bounds ?? null;
}

/**
 * Eight square resize handles placed on a frame {@link LABEL_HANDLE_PADDING}
 * outside the card. Keeping them away from the card border leaves the border
 * free for connection ports, so resizing never competes with creating arrows.
 */
export function labelHandles(annotation: Annotation, canvasWidth: number, canvasHeight: number): LabelHandle[] {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return [];
  const x = label.x - LABEL_HANDLE_PADDING;
  const y = label.y - LABEL_HANDLE_PADDING;
  const right = label.x + label.width + LABEL_HANDLE_PADDING;
  const bottom = label.y + label.height + LABEL_HANDLE_PADDING;
  const middleX = (x + right) / 2;
  const middleY = (y + bottom) / 2;
  const points: Array<[LabelHandlePosition, number, number]> = [
    ['nw', x, y], ['n', middleX, y], ['ne', right, y],
    ['w', x, middleY], ['e', right, middleY],
    ['sw', x, bottom], ['s', middleX, bottom], ['se', right, bottom],
  ];
  const half = LABEL_HANDLE_SIZE / 2;
  return points.map(([position, handleX, handleY]) => ({ position, bounds: { x: handleX - half, y: handleY - half, width: LABEL_HANDLE_SIZE, height: LABEL_HANDLE_SIZE } }));
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
    labelHeightManual: true,
  } as Annotation;
}

export function isDrawable(annotation: Annotation): boolean {
  const b = boundsOf(annotation);
  return annotation.tool === 'pencil' ? annotation.points.length > 1 : annotation.tool === 'text' || b.width + b.height >= 8;
}

// ---------------------------------------------------------------------------
// Card port geometry
// ---------------------------------------------------------------------------

/**
 * The 8 port positions expressed as normalised (portX, portY) pairs.
 * (0,0) = top-left, (0.5,0) = top-centre, (1,0) = top-right, …
 */
export const CARD_PORTS: ReadonlyArray<{ portX: number; portY: number }> = [
  { portX: 0, portY: 0 },    // 0 top-left
  { portX: 0.5, portY: 0 },  // 1 top-centre
  { portX: 1, portY: 0 },    // 2 top-right
  { portX: 1, portY: 0.5 },  // 3 right-centre
  { portX: 1, portY: 1 },    // 4 bottom-right
  { portX: 0.5, portY: 1 },  // 5 bottom-centre
  { portX: 0, portY: 1 },    // 6 bottom-left
  { portX: 0, portY: 0.5 },  // 7 left-centre
];

/**
 * Resolves a normalised port position to an absolute canvas point using the
 * current bounds of the owner annotation's comment card.
 */
export function cardPortPoint(owner: Annotation, portX: number, portY: number, canvasWidth: number, canvasHeight: number): Point | null {
  const label = labelBounds(owner, canvasWidth, canvasHeight);
  if (!label) return null;
  return { x: label.x + label.width * portX, y: label.y + label.height * portY };
}

/**
 * Returns all 8 absolute port positions for the given annotation's comment
 * card, or an empty array if the annotation has no visible card.
 */
export function cardPorts(owner: Annotation, canvasWidth: number, canvasHeight: number): Point[] {
  const label = labelBounds(owner, canvasWidth, canvasHeight);
  if (!label) return [];
  return CARD_PORTS.map(({ portX, portY }) => ({
    x: label.x + label.width * portX,
    y: label.y + label.height * portY,
  }));
}

/**
 * Hit-tests the 8 ports of the given annotation.
 * Returns the port index (0-7) if the point is within `radius` of a port, or
 * -1 if no port was hit.
 */
export function portHitTest(owner: Annotation, point: Point, canvasWidth: number, canvasHeight: number, radius = 8): number {
  const ports = cardPorts(owner, canvasWidth, canvasHeight);
  for (let i = 0; i < ports.length; i += 1) {
    const p = ports[i]!;
    if (Math.hypot(point.x - p.x, point.y - p.y) <= radius) return i;
  }
  return -1;
}

/**
 * Recomputes the stored `start` of every child arrow from its owner card's
 * current bounds. Call after any move, resize or comment change so hit-testing
 * and saved snapshots stay aligned with the rendered geometry.
 */
export function syncChildArrows(annotations: Annotation[], canvasWidth: number, canvasHeight: number): Annotation[] {
  const owners = new Map(annotations.map((annotation) => [annotation.id, annotation]));
  return annotations.map((annotation) => {
    if (annotation.cardOwnerId == null || annotation.cardPortX == null || annotation.cardPortY == null) return annotation;
    const owner = owners.get(annotation.cardOwnerId);
    if (!owner) return annotation;
    const start = cardPortPoint(owner, annotation.cardPortX, annotation.cardPortY, canvasWidth, canvasHeight);
    return start ? { ...annotation, start } as Annotation : annotation;
  });
}
