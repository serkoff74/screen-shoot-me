import { describe, expect, it } from 'vitest';
import { boundsOf, cardAnchor, cardPortPoint, cardPorts, captureScale, commentArrowRoute, commentLeaderRoute, hitTest, hitTestLabel, hitTestLabelResize, LABEL_HANDLE_PADDING, LABEL_MAX_AUTO_HEIGHT, labelAnchor, labelBounds, labelFrameCursor, labelHandleAt, labelHandles, labelResizeHandleBounds, moved, movedLabel, normalizedBounds, pointToSegmentDistance, portHitTest, resizeCursorFor, resizedLabel, resizedShape, SHAPE_HANDLE_PADDING, SHAPE_HANDLE_SIZE, shapeHandles, shapeResizeCursor, shouldShowCommentCard, syncChildArrows, withCardAnchor, wrapLabelLines } from '../editor/geometry';
import type { Annotation } from '../shared';

const arrow: Annotation = { id: 'a', tool: 'arrow', color: '#FF4D2E', width: 4, start: { x: 10, y: 20 }, end: { x: 110, y: 70 } };

describe('annotation geometry', () => {
  it('normalizes a reverse drag', () => expect(normalizedBounds({ x: 80, y: 90 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 70, height: 70 }));
  it('computes an arrow box', () => expect(boundsOf(arrow)).toEqual({ x: 10, y: 20, width: 100, height: 50 }));
  it('measures point-to-line distance', () => expect(pointToSegmentDistance({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4));
  it('hits an arrow near its shaft', () => expect(hitTest(arrow, { x: 60, y: 46 }, 4)).toBe(true));
  it('rejects a far point', () => expect(hitTest(arrow, { x: 60, y: 100 }, 4)).toBe(false));
  it('moves all arrow coordinates', () => expect(moved(arrow, 5, -4)).toMatchObject({ start: { x: 15, y: 16 }, end: { x: 115, y: 66 } }));
  it('attaches a label to the arrow tail and moves only the label', () => {
    const labeled = { ...arrow, label: 'Проверь кнопку' };
    expect(labelAnchor(labeled)).toEqual({ x: 10, y: 20 });
    const box = labelBounds(labeled, 300, 200)!;
    expect(hitTestLabel(labeled, { x: box.x + 2, y: box.y + 2 }, 300, 200)).toBe(true);
    expect(movedLabel(labeled, 30, 15, 300, 200)).toMatchObject({ labelX: box.x + 30, labelY: box.y + 15, start: arrow.start, end: arrow.end });
  });
  it('keeps a saved card exit point while the comment moves and resizes', () => {
    const labeled = { ...arrow, label: 'Проверь кнопку', labelX: 140, labelY: 80, labelWidth: 160, labelHeight: 80 };
    const saved = withCardAnchor(labeled, 500, 500);
    const first = cardAnchor(saved, 500, 500)!;
    const movedCard = movedLabel(saved, 40, 30, 500, 500);
    const resizedCard = resizedLabel(movedCard, 'se', 80, 30, 500, 500);
    expect(cardAnchor(resizedCard, 500, 500)).toMatchObject({ side: first.side, ratio: first.ratio });
  });
  it('routes a comment-owned arrow around another comment card', () => {
    const source = { ...arrow, label: 'Источник', labelX: 320, labelY: 100, labelWidth: 140, labelHeight: 70, labelAnchorSide: 'left' as const, labelAnchorRatio: .5 };
    const obstacle: Annotation = { ...arrow, id: 'b', label: 'Препятствие', labelX: 180, labelY: 45, labelWidth: 110, labelHeight: 120 };
    const route = commentArrowRoute(source, [source, obstacle], 500, 300)!;
    expect(route.length).toBeGreaterThan(2);
    expect(route.at(-1)).toEqual(source.end);
  });
  it('routes a comment arrow around a rectangle annotation without a comment', () => {
    const line: Annotation = { id: 'a', tool: 'arrow', color: '#FF4D2E', width: 4, label: 'Комментарий', labelX: 500, labelY: 40, labelWidth: 150, labelHeight: 70, labelAnchorSide: 'left' as const, labelAnchorRatio: 0.5, start: { x: 0, y: 0 }, end: { x: 120, y: 250 } };
    const rect: Annotation = { id: 'r', tool: 'rect', color: '#FF4D2E', width: 4, start: { x: 150, y: 100 }, end: { x: 300, y: 220 } };
    const route = commentArrowRoute(line, [line, rect], 700, 500)!;
    expect(route.length).toBeGreaterThan(2);
    expect(route.at(-1)).toEqual(line.end);
  });
  it('re-attaches the arrow to the handle facing the target instead of the saved one', () => {
    // Saved exit point is 'left', but the target is to the right of the card.
    const line: Annotation = { id: 'a', tool: 'arrow', color: '#FF4D2E', width: 4, label: 'Комментарий', labelX: 300, labelY: 100, labelWidth: 140, labelHeight: 70, labelAnchorSide: 'left' as const, labelAnchorRatio: 0.5, start: { x: 0, y: 0 }, end: { x: 460, y: 135 } };
    const route = commentArrowRoute(line, [line], 700, 500)!;
    const card = labelBounds(line, 700, 500)!;
    expect(route[0]).toEqual({ x: card.x + card.width, y: card.y + card.height / 2 });
    expect(route).toHaveLength(2);
    expect(route.at(-1)).toEqual(line.end);
  });
  it('keeps the arrow off its own card when the target is inside a foreign card', () => {
    const line: Annotation = { id: 'a', tool: 'arrow', color: '#FF4D2E', width: 4, label: 'Комментарий', labelX: 300, labelY: 100, labelWidth: 140, labelHeight: 70, labelAnchorSide: 'left' as const, labelAnchorRatio: 0.5, start: { x: 0, y: 0 }, end: { x: 500, y: 135 } };
    const foreign: Annotation = { ...arrow, id: 'f', label: 'Чужой', labelX: 460, labelY: 100, labelWidth: 120, labelHeight: 70 };
    const route = commentArrowRoute(line, [line, foreign], 700, 500)!;
    const card = labelBounds(line, 700, 500)!;
    // Leaves from the facing handle, not the saved 'left' one that would cross the card.
    expect(route).not.toBeNull();
    expect(route[0]).toEqual({ x: card.x + card.width, y: card.y + card.height / 2 });
    expect(route.at(-1)).toEqual(line.end);
  });
  it('lets the arrow enter its own card when the target is inside it', () => {
    const line: Annotation = { id: 'a', tool: 'arrow', color: '#FF4D2E', width: 4, label: 'Комментарий', labelX: 300, labelY: 100, labelWidth: 140, labelHeight: 70, labelAnchorSide: 'left' as const, labelAnchorRatio: 0.5, start: { x: 0, y: 0 }, end: { x: 370, y: 135 } };
    const route = commentArrowRoute(line, [line], 700, 500)!;
    const card = labelBounds(line, 700, 500)!;
    expect(route.at(-1)).toEqual(line.end);
    const onBorder = route[0]!.x === card.x || route[0]!.x === card.x + card.width || route[0]!.y === card.y || route[0]!.y === card.y + card.height;
    expect(onBorder).toBe(true);
  });
  it('narrows the leader safe zone to 5px when the 10px zone leaves no path', () => {
    // The leader reaches the card at (400,135), which sits inside a 10px zone
    // above the block (top edge 142 - 10 = 132) but outside its 5px zone (137).
    const rect: Annotation = { id: 'r', tool: 'rect', color: '#FF4D2E', width: 4, start: { x: 100, y: 100 }, end: { x: 200, y: 180 }, label: 'Блок', labelX: 400, labelY: 100, labelWidth: 140, labelHeight: 70 };
    const obstacle: Annotation = { ...arrow, id: 'obs', label: 'Препятствие', labelX: 350, labelY: 142, labelWidth: 120, labelHeight: 54 };
    const anchor = cardAnchor(rect, 700, 500)!;
    expect(anchor.point).toEqual({ x: 400, y: 135 });
    const route = commentLeaderRoute(rect, [rect, obstacle], 700, 500)!;
    expect(route).not.toBeNull();
    expect(route.at(-1)).toEqual(anchor.point);
  });
  it('wraps a long comment in a resizable card and exposes a resize handle', () => {
    const labeled = { ...arrow, label: 'Очень длинный комментарий для проверки переноса слов', labelWidth: 120 };
    const box = labelBounds(labeled, 500, 500)!;
    expect(wrapLabelLines(labeled.label!, 98).length).toBeGreaterThan(1);
    expect(wrapLabelLines('abcdefghijklmnopqrstuvwxyz', 25).every((line) => line.length <= 2)).toBe(true);
    expect(box.height).toBeGreaterThan(54);
    const handle = labelResizeHandleBounds(labeled, 500, 500)!;
    expect(hitTestLabelResize(labeled, { x: handle.x + 2, y: handle.y + 2 }, 500, 500)).toBe(true);
    expect(labelHandles(labeled, 500, 500)).toHaveLength(8);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect(labelHandleAt(labeled, center, 500, 500)).toBeNull();
    expect(hitTestLabel(labeled, center, 500, 500)).toBe(true);
    expect(resizedLabel(labeled, 'se', 80, 40, 500, 500)).toMatchObject({ labelWidth: box.width + 80, labelHeight: box.height + 40 });
  });
  it('auto-fits a comment height within its maximum and preserves a manual height', () => {
    const short = { ...arrow, label: 'Коротко', labelWidth: 180 };
    expect(labelBounds(short, 600, 600)!.height).toBe(54);
    const long = { ...short, label: Array.from({ length: 80 }, () => 'длинный').join(' ') };
    expect(labelBounds(long, 600, 1200)!.height).toBe(LABEL_MAX_AUTO_HEIGHT);
    const manuallyResized = { ...long, labelHeight: 360, labelHeightManual: true };
    expect(labelBounds(manuallyResized, 600, 1200)!.height).toBe(360);
  });
  it('exposes eight connection ports on the card boundary and hit-tests them', () => {
    const owner: Annotation = { ...arrow, id: 'owner', label: 'Источник', labelX: 100, labelY: 60, labelWidth: 160, labelHeight: 80 };
    const box = labelBounds(owner, 600, 400)!;
    const ports = cardPorts(owner, 600, 400);
    expect(ports).toHaveLength(8);
    expect(ports[0]).toEqual({ x: box.x, y: box.y });
    expect(ports[3]).toEqual({ x: box.x + box.width, y: box.y + box.height / 2 });
    expect(ports[6]).toEqual({ x: box.x, y: box.y + box.height });
    expect(portHitTest(owner, { x: box.x, y: box.y }, 600, 400)).toBe(0);
    expect(portHitTest(owner, { x: box.x + box.width, y: box.y + box.height }, 600, 400)).toBe(4);
    expect(portHitTest(owner, { x: box.x + 40, y: box.y + 40 }, 600, 400)).toBe(-1);
    expect(cardPortPoint(owner, 0.5, 0.5, 600, 400)).toEqual({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  });
  it('keeps child arrows attached to their owner card through move and resize', () => {
    const owner: Annotation = { ...arrow, id: 'owner', label: 'Комментарий', labelX: 100, labelY: 80, labelWidth: 160, labelHeight: 80 };
    const child: Annotation = { ...arrow, id: 'child', cardOwnerId: 'owner', cardPortX: 1, cardPortY: 0.5, start: { x: 0, y: 0 }, end: { x: 420, y: 260 } };
    const box = labelBounds(owner, 600, 400)!;
    expect(syncChildArrows([owner, child], 600, 400).find((item) => item.id === 'child')).toMatchObject({
      start: { x: box.x + box.width, y: box.y + box.height / 2 }, end: child.end,
    });
    const resized = resizedLabel(movedLabel(owner, 50, 20, 600, 400), 'se', 40, 30, 600, 400);
    const newBox = labelBounds(resized, 600, 400)!;
    expect(syncChildArrows([resized, child], 600, 400).find((item) => item.id === 'child')).toMatchObject({
      start: { x: newBox.x + newBox.width, y: newBox.y + newBox.height / 2 },
    });
  });
  it('re-attaches a child arrow to a different handle so it clears a foreign card', () => {
    const owner: Annotation = { ...arrow, id: 'owner', label: 'Источник', labelX: 360, labelY: 120, labelWidth: 150, labelHeight: 80 };
    const child: Annotation = { ...arrow, id: 'child', cardOwnerId: 'owner', cardPortX: 0, cardPortY: 0.5, start: { x: 0, y: 0 }, end: { x: 60, y: 250 } };
    const obstacle: Annotation = { ...arrow, id: 'b', label: 'Препятствие', labelX: 150, labelY: 130, labelWidth: 120, labelHeight: 110 };
    const annotations = [owner, child, obstacle];
    const route = commentArrowRoute(child, annotations, 600, 400)!;
    expect(route.at(-1)).toEqual(child.end);
    const card = labelBounds(owner, 600, 400)!;
    const onBorder = route[0]!.x === card.x || route[0]!.x === card.x + card.width || route[0]!.y === card.y || route[0]!.y === card.y + card.height;
    expect(onBorder).toBe(true);
  });
  it('reports a resize direction along a rectangle border and nothing in its centre', () => {
    const box = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeCursorFor(box, { x: 100, y: 150 })).toBe('w');
    expect(resizeCursorFor(box, { x: 300, y: 150 })).toBe('e');
    expect(resizeCursorFor(box, { x: 200, y: 100 })).toBe('n');
    expect(resizeCursorFor(box, { x: 200, y: 200 })).toBe('s');
    expect(resizeCursorFor(box, { x: 100, y: 100 })).toBe('nw');
    expect(resizeCursorFor(box, { x: 300, y: 200 })).toBe('se');
    expect(resizeCursorFor(box, { x: 200, y: 150 })).toBeNull();
    expect(resizeCursorFor(box, { x: 400, y: 150 })).toBeNull();
  });
  it('places eight resize handles around a shape and hit-tests its frame', () => {
    const rect: Annotation = { id: 'r', tool: 'rect', color: '#FF4D2E', width: 4, start: { x: 100, y: 100 }, end: { x: 300, y: 260 } };
    const handles = shapeHandles(rect);
    expect(handles).toHaveLength(8);
    const box = boundsOf(rect);
    const se = handles.find((handle) => handle.position === 'se')!;
    expect(se.bounds.x).toBeCloseTo(box.x + box.width + SHAPE_HANDLE_PADDING - SHAPE_HANDLE_SIZE / 2);
    expect(se.bounds.y).toBeCloseTo(box.y + box.height + SHAPE_HANDLE_PADDING - SHAPE_HANDLE_SIZE / 2);
    expect(shapeResizeCursor(rect, { x: box.x + box.width, y: box.y + box.height / 2 })).toBe('e');
    expect(shapeResizeCursor(rect, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBeNull();
  });
  it('scales an arrow from a corner while keeping the opposite edge fixed', () => {
    const line: Annotation = { id: 'line', tool: 'arrow', color: '#FF4D2E', width: 4, start: { x: 100, y: 100 }, end: { x: 200, y: 200 } };
    expect(resizedShape(line, 'se', 100, 100)).toMatchObject({ start: { x: 100, y: 100 }, end: { x: 300, y: 300 } });
    expect(resizedShape(line, 'nw', -50, -50)).toMatchObject({ start: { x: 50, y: 50 }, end: { x: 200, y: 200 } });
    const flat: Annotation = { id: 'flat', tool: 'arrow', color: '#FF4D2E', width: 4, start: { x: 100, y: 100 }, end: { x: 200, y: 100 } };
    // A horizontal arrow only stretches horizontally; the vertical drag is ignored.
    expect(resizedShape(flat, 's', 0, 40)).toMatchObject({ start: { x: 100, y: 100 }, end: { x: 200, y: 100 } });
    expect(resizedShape(flat, 'e', 60, 0)).toMatchObject({ start: { x: 100, y: 100 }, end: { x: 260, y: 100 } });
  });
  it('hit-tests a comment card frame border for resizing', () => {
    const card: Annotation = { ...arrow, id: 'card', label: 'Комментарий', labelX: 100, labelY: 100, labelWidth: 160, labelHeight: 80 };
    const label = labelBounds(card, 600, 400)!;
    expect(labelFrameCursor(card, { x: label.x + label.width + LABEL_HANDLE_PADDING, y: label.y + label.height / 2 }, 600, 400)).toBe('e');
    expect(labelFrameCursor(card, { x: label.x + label.width / 2, y: label.y + label.height / 2 }, 600, 400)).toBeNull();
  });
  it('ties a shape comment to the shape and routes the leader around other cards', () => {
    const rect: Annotation = { id: 'r', tool: 'rect', color: '#FF4D2E', width: 4, start: { x: 100, y: 100 }, end: { x: 200, y: 180 }, label: 'Блок', labelX: 400, labelY: 100, labelWidth: 140, labelHeight: 70 };
    const anchor = cardAnchor(rect, 600, 400)!;
    // Shape comments leave from the middle of the card side nearest the shape.
    expect(anchor).toEqual({ side: 'left', ratio: 0.5, point: { x: 400, y: 135 } });
    const straight = commentLeaderRoute(rect, [rect], 600, 400)!;
    expect(straight.length).toBeGreaterThanOrEqual(2);
    expect(straight[0]).toEqual({ x: 200, y: 135 });
    expect(straight.at(-1)).toEqual(anchor.point);
    const obstacle: Annotation = { ...arrow, id: 'obs', label: 'Препятствие', labelX: 260, labelY: 135, labelWidth: 16, labelHeight: 40 };
    const routed = commentLeaderRoute(rect, [rect, obstacle], 600, 400)!;
    expect(routed.length).toBeGreaterThan(2);
    expect(routed.at(-1)).toEqual(anchor.point);
    // Arrows and text are their own connector, so they have no leader route.
    expect(commentLeaderRoute({ ...arrow, label: 'Стрелка' }, [arrow], 600, 400)).toBeNull();
  });
  it('attaches shape comments from the middle of the card edge facing the shape', () => {
    const shape = (extra: Partial<Annotation>): Annotation => ({ id: 's', tool: 'rect', color: '#FF4D2E', width: 4, start: { x: 200, y: 200 }, end: { x: 300, y: 280 }, ...extra } as Annotation);
    expect(cardAnchor(shape({ label: 'Низ', labelX: 220, labelY: 360, labelWidth: 160, labelHeight: 70 }), 700, 500)).toMatchObject({ side: 'top', ratio: 0.5 });
    expect(cardAnchor(shape({ label: 'Верх', labelX: 220, labelY: 40, labelWidth: 160, labelHeight: 70 }), 700, 500)).toMatchObject({ side: 'bottom', ratio: 0.5 });
    expect(cardAnchor(shape({ label: 'Право', labelX: 430, labelY: 210, labelWidth: 160, labelHeight: 70 }), 700, 500)).toMatchObject({ side: 'left', ratio: 0.5 });
    expect(cardAnchor(shape({ label: 'Лево', labelX: 20, labelY: 210, labelWidth: 160, labelHeight: 70 }), 700, 500)).toMatchObject({ side: 'right', ratio: 0.5 });
    expect(cardAnchor(shape({ tool: 'ellipse', label: 'Овал', labelX: 220, labelY: 360, labelWidth: 160, labelHeight: 70 }), 700, 500)).toMatchObject({ side: 'top', ratio: 0.5 });
  });
  it('gives a pencil comment a leader anchored on its stroke', () => {
    const pencil: Annotation = { id: 'p', tool: 'pencil', color: '#FF4D2E', width: 4, points: [{ x: 100, y: 300 }, { x: 200, y: 100 }, { x: 300, y: 300 }], label: 'Карандаш', labelX: 100, labelY: 60, labelWidth: 140, labelHeight: 70 };
    const route = commentLeaderRoute(pencil, [pencil], 700, 500)!;
    const anchor = cardAnchor(pencil, 700, 500)!;
    expect(route.at(-1)).toEqual(anchor.point);
    const start = route[0]!;
    const b = boundsOf(pencil);
    expect(start.x).toBeGreaterThanOrEqual(b.x);
    expect(start.x).toBeLessThanOrEqual(b.x + b.width);
    expect(start.y).toBeGreaterThanOrEqual(b.y);
    expect(start.y).toBeLessThanOrEqual(b.y + b.height);
  });
  it.each([
    [1280, 800, 1280, 800, 1],
    [1600, 1000, 1280, 800, 1.25],
    [1920, 1200, 1280, 800, 1.5],
    [2560, 1600, 1280, 800, 2],
  ])('maps a %sx%s capture over a %sx%s CSS viewport', (imageWidth, imageHeight, viewportWidth, viewportHeight, expected) => {
    expect(captureScale(imageWidth, imageHeight, viewportWidth, viewportHeight)).toEqual({ x: expected, y: expected });
  });
});

describe('empty comment binding', () => {
  const emptyRect: Annotation = { id: 'r', tool: 'rect', color: '#FF4D2E', width: 4, start: { x: 100, y: 100 }, end: { x: 200, y: 180 }, hasComment: true };

  it('keeps a card for an annotation whose comment is still empty', () => {
    expect(labelBounds(emptyRect, 600, 400)).not.toBeNull();
    expect(labelBounds({ ...emptyRect, hasComment: false, label: '' }, 600, 400)).toBeNull();
  });

  it('shows an empty card in the editor but not in the export', () => {
    expect(shouldShowCommentCard(emptyRect, true)).toBe(true);
    expect(shouldShowCommentCard(emptyRect, false)).toBe(false);
    expect(shouldShowCommentCard({ ...emptyRect, label: 'Текст' }, false)).toBe(true);
  });

  it('stores the card anchor even when the comment is empty', () => {
    const withAnchor = withCardAnchor(emptyRect, 600, 400);
    expect(withAnchor.labelAnchorSide).toBeDefined();
    expect(cardAnchor(withAnchor, 600, 400)).not.toBeNull();
    expect(commentLeaderRoute(withAnchor, [withAnchor], 600, 400)).not.toBeNull();
  });

  it('survives move and resize of the card and the shape', () => {
    const withAnchor = withCardAnchor(emptyRect, 600, 400);
    const movedCard = movedLabel(withAnchor, 30, 20, 600, 400);
    const resizedCard = resizedLabel(movedCard, 'se', 40, 30, 600, 400);
    expect(resizedCard.hasComment).toBe(true);
    expect(moved(resizedCard, 5, -4).hasComment).toBe(true);
    expect(labelBounds(resizedCard, 600, 400)).not.toBeNull();
  });

  it('keeps child arrows attached to an empty owner card', () => {
    const child: Annotation = { ...arrow, id: 'child', cardOwnerId: 'r', cardPortX: 1, cardPortY: 0.5, start: { x: 0, y: 0 }, end: { x: 420, y: 260 } };
    const synced = syncChildArrows([emptyRect, child], 600, 400).find((item) => item.id === 'child');
    const box = labelBounds(emptyRect, 600, 400)!;
    expect(synced).toMatchObject({ start: { x: box.x + box.width, y: box.y + box.height / 2 } });
  });
});
