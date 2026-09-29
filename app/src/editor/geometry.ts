import type { Annotation, Bounds, LabelAnchorSide, Point } from '../shared';

export const LABEL_MIN_WIDTH = 120;
export const LABEL_MIN_HEIGHT = 54;
export const LABEL_MAX_AUTO_HEIGHT = 240;
/** Distance between the card border and the resize-handle frame. */
export const LABEL_HANDLE_PADDING = 10;
/** Side length of a square resize handle. */
export const LABEL_HANDLE_SIZE = 9;
/** Distance between a shape's bounds and its resize-handle frame. */
export const SHAPE_HANDLE_PADDING = 6;
/** Side length of a shape resize handle. */
export const SHAPE_HANDLE_SIZE = 8;
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

function anchorPointOnSide(label: Bounds, side: LabelAnchorSide, ratio: number): Point {
  if (side === 'top') return { x: label.x + label.width * ratio, y: label.y };
  if (side === 'right') return { x: label.x + label.width, y: label.y + label.height * ratio };
  if (side === 'bottom') return { x: label.x + label.width * ratio, y: label.y + label.height };
  return { x: label.x, y: label.y + label.height * ratio };
}

/** Card side whose border segment is closest to the reference point. */
function nearestCardSide(label: Bounds, reference: Point): LabelAnchorSide {
  const distances: Array<[LabelAnchorSide, number]> = [
    ['top', pointToSegmentDistance(reference, { x: label.x, y: label.y }, { x: label.x + label.width, y: label.y })],
    ['right', pointToSegmentDistance(reference, { x: label.x + label.width, y: label.y }, { x: label.x + label.width, y: label.y + label.height })],
    ['bottom', pointToSegmentDistance(reference, { x: label.x, y: label.y + label.height }, { x: label.x + label.width, y: label.y + label.height })],
    ['left', pointToSegmentDistance(reference, { x: label.x, y: label.y }, { x: label.x, y: label.y + label.height })],
  ];
  return distances.reduce((closest, item) => item[1] < closest[1] ? item : closest)[0];
}

/**
 * Keeps a comment connector attached to a stable point on its card. Shape
 * comments (rect/ellipse/pencil) always leave from the middle of the card side
 * nearest the shape; arrow comments keep their saved exit point so the arrow
 * does not jump when the card moves.
 */
export function cardAnchor(annotation: Annotation, canvasWidth: number, canvasHeight: number): CardAnchor | null {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return null;
  if (annotation.tool === 'rect' || annotation.tool === 'ellipse' || annotation.tool === 'pencil') {
    const shape = boundsOf(annotation);
    const side = nearestCardSide(label, { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });
    return { side, ratio: 0.5, point: anchorPointOnSide(label, side, 0.5) };
  }
  const legacy = labelAnchor(annotation);
  const distances: Array<[LabelAnchorSide, number]> = [
    ['top', Math.abs(legacy.y - label.y)], ['right', Math.abs(legacy.x - (label.x + label.width))],
    ['bottom', Math.abs(legacy.y - (label.y + label.height))], ['left', Math.abs(legacy.x - label.x)],
  ];
  const side = annotation.labelAnchorSide ?? distances.reduce((closest, item) => item[1] < closest[1] ? item : closest)[0];
  const ratio = clamp(annotation.labelAnchorRatio ?? (side === 'top' || side === 'bottom'
    ? (legacy.x - label.x) / label.width : (legacy.y - label.y) / label.height), 0, 1);
  return { side, ratio, point: anchorPointOnSide(label, side, ratio) };
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

/** Preferred clearance between a route and an obstacle, in canvas pixels. */
const ROUTE_PADDING = 10;
/** Minimum clearance used when the preferred safe zone leaves no valid path. */
const ROUTE_PADDING_MIN = 5;

/**
 * Shortest route between two points that does not cross any obstacle box. The
 * boxes are treated as their expanded corners, so the path bends around them.
 * Returns null when every path is blocked (the caller then falls back).
 */
function routeAround(start: Point, end: Point, obstacles: Bounds[]): Point[] | null {
  const nodes: Point[] = [start, end];
  // Extra clearance so the smoothed (Bezier) arrow keeps out of the safe zone.
  const clearance = 4;
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
  if (!Number.isFinite(distances[1])) return null;
  const route: Point[] = [];
  for (let cursor = 1; cursor >= 0; cursor = previous[cursor]!) { route.unshift(nodes[cursor]!); if (cursor === 0) break; }
  return route;
}

/**
 * Obstacles that a route must avoid: every comment card plus rect/ellipse
 * shapes (pencil strokes are ignored for now). The annotation itself and its
 * owning card are excluded.
 */
function routeObstacleBoxes(annotation: Annotation, annotations: Annotation[], canvasWidth: number, canvasHeight: number, excludeId = annotation.id): Bounds[] {
  const boxes: Bounds[] = [];
  for (const item of annotations) {
    if (item.id === annotation.id || item.id === excludeId) continue;
    const label = labelBounds(item, canvasWidth, canvasHeight);
    if (label) boxes.push(label);
    if (item.tool === 'rect' || item.tool === 'ellipse') boxes.push(boundsOf(item));
  }
  return boxes;
}

/**
 * Routes around the obstacles with a safe zone around each one. It first tries
 * the full {@link ROUTE_PADDING}, then narrows it down to
 * {@link ROUTE_PADDING_MIN} when the wider zone leaves no path, and only falls
 * back to a straight line when even that does not fit.
 */
function routeAvoiding(start: Point, end: Point, boxes: Bounds[], padding = ROUTE_PADDING): Point[] {
  for (const step of [padding, Math.max(ROUTE_PADDING_MIN, Math.floor(padding / 2))]) {
    const route = routeAround(start, end, boxes.map((box) => expanded(box, step)));
    if (route) return route;
  }
  return [start, end];
}

function routeLength(route: Point[]): number {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) total += Math.hypot(route[index]!.x - route[index - 1]!.x, route[index]!.y - route[index - 1]!.y);
  return total;
}

/** The connection handle (port) on a card closest to the target point. */
function nearestHandle(box: Bounds, target: Point): Point {
  let best: Point = { x: box.x, y: box.y };
  let bestDistance = Infinity;
  for (const { portX, portY } of CARD_PORTS) {
    const point = { x: box.x + box.width * portX, y: box.y + box.height * portY };
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance < bestDistance) { bestDistance = distance; best = point; }
  }
  return best;
}

/**
 * Obstacles for an arrow route: every comment card (including the arrow's own
 * card) plus rect/ellipse shapes. The arrow annotation itself is never an
 * obstacle, and its owner card is returned separately so it can use a zero
 * safe zone (the arrow starts right on its border).
 */
function arrowObstacles(annotation: Annotation, ownerId: string, annotations: Annotation[], canvasWidth: number, canvasHeight: number): Bounds[] {
  const boxes: Bounds[] = [];
  for (const item of annotations) {
    if (item.id === annotation.id) continue;
    // The owner card is passed separately (zero safe zone); its rect/ellipse
    // shape is still an obstacle, but its label is not added twice.
    if (item.id !== ownerId) {
      const label = labelBounds(item, canvasWidth, canvasHeight);
      if (label) boxes.push(label);
    }
    if (item.tool === 'rect' || item.tool === 'ellipse') boxes.push(boundsOf(item));
  }
  return boxes;
}

/** Route from a card handle that leaves the card and avoids every obstacle. */
function routeFromCard(start: Point, end: Point, card: Bounds | null, obstacles: Bounds[], padding: number): Point[] | null {
  for (const step of [padding, Math.max(ROUTE_PADDING_MIN, Math.floor(padding / 2))]) {
    const boxes = card ? [card, ...obstacles.map((box) => expanded(box, step))] : obstacles.map((box) => expanded(box, step));
    const route = routeAround(start, end, boxes);
    if (route) return route;
  }
  return null;
}

/**
 * The arrow's own comment card is an obstacle and its attachment point is
 * dynamic: every handle of the card is tried and the shortest route that never
 * crosses the card or any other obstacle wins. This re-attaches the arrow to a
 * different side when the card or target moves.
 */
export function commentArrowRoute(annotation: Annotation, annotations: Annotation[], canvasWidth: number, canvasHeight: number, padding = ROUTE_PADDING): Point[] | null {
  if (annotation.tool !== 'arrow') return null;
  const owner = annotation.cardOwnerId
    ? annotations.find((item) => item.id === annotation.cardOwnerId)
    : (annotation.label?.trim() ? annotation : undefined);
  if (!owner) return null;
  const card = labelBounds(owner, canvasWidth, canvasHeight);
  if (!card) return null;
  const contains = (box: Bounds) => annotation.end.x > box.x && annotation.end.x < box.x + box.width && annotation.end.y > box.y && annotation.end.y < box.y + box.height;
  // Reaching a target inside a box unavoidably crosses that box, so only boxes
  // holding the target are dropped (e.g. the arrow's own card). Every other
  // card/shape stays an obstacle, so the arrow never crosses its own card just
  // because the target sits inside some other card.
  const obstacles = arrowObstacles(annotation, owner.id, annotations, canvasWidth, canvasHeight).filter((box) => !contains(box));
  const cardObstacle = contains(card) ? null : card;
  let best: Point[] | null = null;
  let bestLength = Infinity;
  for (const { portX, portY } of CARD_PORTS) {
    const start = { x: card.x + card.width * portX, y: card.y + card.height * portY };
    const route = routeFromCard(start, annotation.end, cardObstacle, obstacles, padding);
    if (!route) continue;
    const length = routeLength(route);
    if (length < bestLength) { bestLength = length; best = route; }
  }
  return best ?? [nearestHandle(card, annotation.end), annotation.end];
}

/** Closest point on (or inside projected to) a rectangle's border. */
function closestPointOnBounds(bounds: Bounds, point: Point): Point {
  const clampedX = Math.max(bounds.x, Math.min(point.x, bounds.x + bounds.width));
  const clampedY = Math.max(bounds.y, Math.min(point.y, bounds.y + bounds.height));
  if (clampedX !== point.x || clampedY !== point.y) return { x: clampedX, y: clampedY };
  const options: Array<[number, Point]> = [
    [Math.abs(point.x - bounds.x), { x: bounds.x, y: point.y }],
    [Math.abs(point.x - (bounds.x + bounds.width)), { x: bounds.x + bounds.width, y: point.y }],
    [Math.abs(point.y - bounds.y), { x: point.x, y: bounds.y }],
    [Math.abs(point.y - (bounds.y + bounds.height)), { x: point.x, y: bounds.y + bounds.height }],
  ];
  return options.reduce((best, item) => item[0] < best[0] ? item : best)[1];
}

function nearestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** The point on a shape where its comment leader attaches. */
function shapeAnchorPoint(annotation: Annotation, point: Point): Point {
  const b = boundsOf(annotation);
  if (annotation.tool === 'ellipse') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rx = Math.max(1, b.width / 2);
    const ry = Math.max(1, b.height / 2);
    const angle = Math.atan2(point.y - cy, point.x - cx);
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  }
  if (annotation.tool === 'pencil') {
    // Anchor to the closest point on the stroke rather than its bounding box.
    let best = annotation.points[0] ?? point;
    let bestDistance = Infinity;
    for (let index = 1; index < annotation.points.length; index += 1) {
      const candidate = nearestPointOnSegment(point, annotation.points[index - 1]!, annotation.points[index]!);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) { bestDistance = distance; best = candidate; }
    }
    return { x: best.x, y: best.y };
  }
  return closestPointOnBounds(b, point);
}

/**
 * Route of the dashed leader that ties a shape's comment card to the shape. It
 * avoids other comment cards the same way arrow routes do. Arrows are their own
 * connector and text is a card, so both return null.
 */
export function commentLeaderRoute(annotation: Annotation, annotations: Annotation[], canvasWidth: number, canvasHeight: number, padding = ROUTE_PADDING): Point[] | null {
  if (annotation.tool !== 'rect' && annotation.tool !== 'ellipse' && annotation.tool !== 'pencil') return null;
  if (!annotation.label?.trim()) return null;
  const anchor = cardAnchor(annotation, canvasWidth, canvasHeight);
  if (!anchor) return null;
  const target = shapeAnchorPoint(annotation, anchor.point);
  return routeAvoiding(target, anchor.point, routeObstacleBoxes(annotation, annotations, canvasWidth, canvasHeight), padding);
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
// Shape resize geometry
// ---------------------------------------------------------------------------

export type ResizeDirection = Exclude<LabelHandlePosition, 'move'>;

/**
 * Returns the resize direction the point is hovering over the border of a
 * rectangle, or null when it is not near any edge or corner. The whole border
 * band reacts (not just the small handles), so the resize affordance is easy to
 * discover.
 */
export function resizeCursorFor(bounds: Bounds, point: Point, tolerance = 6): ResizeDirection | null {
  const { x, y, width, height } = bounds;
  if (point.x < x - tolerance || point.x > x + width + tolerance) return null;
  if (point.y < y - tolerance || point.y > y + height + tolerance) return null;
  const left = Math.abs(point.x - x) <= tolerance;
  const right = Math.abs(point.x - (x + width)) <= tolerance;
  const top = Math.abs(point.y - y) <= tolerance;
  const bottom = Math.abs(point.y - (y + height)) <= tolerance;
  if (top && left) return 'nw';
  if (top && right) return 'ne';
  if (bottom && left) return 'sw';
  if (bottom && right) return 'se';
  if (left) return 'w';
  if (right) return 'e';
  if (top) return 'n';
  if (bottom) return 's';
  return null;
}

/** Hover test for a comment card's resize frame (handles and border). */
export function labelFrameCursor(annotation: Annotation, point: Point, canvasWidth: number, canvasHeight: number, tolerance = 7): ResizeDirection | null {
  const label = labelBounds(annotation, canvasWidth, canvasHeight);
  if (!label) return null;
  return resizeCursorFor({
    x: label.x - LABEL_HANDLE_PADDING,
    y: label.y - LABEL_HANDLE_PADDING,
    width: label.width + LABEL_HANDLE_PADDING * 2,
    height: label.height + LABEL_HANDLE_PADDING * 2,
  }, point, tolerance);
}

/** Eight resize handles on the frame around a shape's bounds. */
export function shapeHandles(annotation: Annotation): LabelHandle[] {
  const b = boundsOf(annotation);
  const x = b.x - SHAPE_HANDLE_PADDING;
  const y = b.y - SHAPE_HANDLE_PADDING;
  const right = b.x + b.width + SHAPE_HANDLE_PADDING;
  const bottom = b.y + b.height + SHAPE_HANDLE_PADDING;
  const middleX = (x + right) / 2;
  const middleY = (y + bottom) / 2;
  const points: Array<[ResizeDirection, number, number]> = [
    ['nw', x, y], ['n', middleX, y], ['ne', right, y],
    ['w', x, middleY], ['e', right, middleY],
    ['sw', x, bottom], ['s', middleX, bottom], ['se', right, bottom],
  ];
  const half = SHAPE_HANDLE_SIZE / 2;
  return points.map(([position, handleX, handleY]) => ({ position, bounds: { x: handleX - half, y: handleY - half, width: SHAPE_HANDLE_SIZE, height: SHAPE_HANDLE_SIZE } }));
}

/** Hover test for a selected shape's resize frame (handles and border). */
export function shapeResizeCursor(annotation: Annotation, point: Point, tolerance = 7): ResizeDirection | null {
  if (annotation.tool === 'pencil' || annotation.tool === 'text' || annotation.tool === 'arrow') return null;
  const b = boundsOf(annotation);
  const width = b.width + SHAPE_HANDLE_PADDING * 2;
  const height = b.height + SHAPE_HANDLE_PADDING * 2;
  // Thin shapes (e.g. a nearly flat arrow) must not turn their whole body into
  // a resize zone, otherwise the shape could not be grabbed to move.
  const band = Math.max(3, Math.min(tolerance, Math.min(width, height) / 3));
  return resizeCursorFor({ x: b.x - SHAPE_HANDLE_PADDING, y: b.y - SHAPE_HANDLE_PADDING, width, height }, point, band);
}

/**
 * Resizes an arrow, rectangle or ellipse by dragging one of its frame edges or
 * corners. The opposite edge stays put and the endpoints are remapped
 * proportionally, so the shape scales in every direction.
 */
export function resizedShape(annotation: Annotation, handle: ResizeDirection, dx: number, dy: number): Annotation {
  if (annotation.tool !== 'arrow' && annotation.tool !== 'rect' && annotation.tool !== 'ellipse') return annotation;
  const b = boundsOf(annotation);
  const isLeft = handle.includes('w');
  const isRight = handle.includes('e');
  const isTop = handle.includes('n');
  const isBottom = handle.includes('s');
  const min = 8;
  // A flat arrow only resizes along the axis it actually spans.
  const allowX = !(annotation.tool === 'arrow' && b.width === 0);
  const allowY = !(annotation.tool === 'arrow' && b.height === 0);
  let x = b.x;
  let y = b.y;
  let width = b.width;
  let height = b.height;
  if (allowX && isLeft) { width = Math.max(min, b.width - dx); x = b.x + b.width - width; }
  else if (allowX && isRight) width = Math.max(min, b.width + dx);
  if (allowY && isTop) { height = Math.max(min, b.height - dy); y = b.y + b.height - height; }
  else if (allowY && isBottom) height = Math.max(min, b.height + dy);
  const mapX = (px: number) => (b.width === 0 ? x : x + ((px - b.x) / b.width) * width);
  const mapY = (py: number) => (b.height === 0 ? y : y + ((py - b.y) / b.height) * height);
  return {
    ...annotation,
    start: { x: mapX(annotation.start.x), y: mapY(annotation.start.y) },
    end: { x: mapX(annotation.end.x), y: mapY(annotation.end.y) },
  } as Annotation;
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
