import { describe, expect, it } from 'vitest';
import { boundsOf, cardAnchor, captureScale, commentArrowRoute, hitTest, hitTestLabel, hitTestLabelResize, labelAnchor, labelBounds, labelHandleAt, labelHandles, labelResizeHandleBounds, moved, movedLabel, normalizedBounds, pointToSegmentDistance, resizedLabel, withCardAnchor, wrapLabelLines } from '../editor/geometry';
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
  it('wraps a long comment in a resizable card and exposes a resize handle', () => {
    const labeled = { ...arrow, label: 'Очень длинный комментарий для проверки переноса слов', labelWidth: 120 };
    const box = labelBounds(labeled, 500, 500)!;
    expect(wrapLabelLines(labeled.label!, 98).length).toBeGreaterThan(1);
    expect(wrapLabelLines('abcdefghijklmnopqrstuvwxyz', 25).every((line) => line.length <= 2)).toBe(true);
    expect(box.height).toBeGreaterThan(54);
    const handle = labelResizeHandleBounds(labeled, 500, 500)!;
    expect(hitTestLabelResize(labeled, { x: handle.x + 2, y: handle.y + 2 }, 500, 500)).toBe(true);
    expect(labelHandles(labeled, 500, 500)).toHaveLength(9);
    expect(labelHandleAt(labeled, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 500, 500)).toBe('move');
    expect(resizedLabel(labeled, 'se', 80, 40, 500, 500)).toMatchObject({ labelWidth: box.width + 80, labelHeight: box.height + 40 });
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
