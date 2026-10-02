export const ANNOTATION_CORAL = '#FF4D2E';
export const UI_BLUE = '#4C8DFF';

export type Tool = 'select' | 'arrow' | 'rect' | 'ellipse' | 'pencil' | 'text';
export type Point = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };
export type LabelAnchorSide = 'top' | 'right' | 'bottom' | 'left';

export type BaseAnnotation = {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  label?: string;
  /**
   * True once the annotation owns a comment card. Kept even while the comment
   * text is empty, so the card and its leader stay bound to the annotation.
   */
  hasComment?: boolean;
  labelX?: number;
  labelY?: number;
  /** Explicit comment-card dimensions in canvas pixels. */
  labelWidth?: number;
  labelHeight?: number;
  /** A user-resized height must not be replaced by automatic text fitting. */
  labelHeightManual?: boolean;
  /** Stable point where a comment-owned arrow leaves its card. */
  labelAnchorSide?: LabelAnchorSide;
  /** Position on the anchor side, from 0 (start) through 1 (end). */
  labelAnchorRatio?: number;
  /**
   * When set, this arrow is a "child" arrow owned by the comment card with
   * this id. Its `start` point is recomputed from the owner's bounds whenever
   * the owner moves or resizes.
   */
  cardOwnerId?: string;
  /**
   * Normalised position of the port on the owner card's boundary.
   * Both values are in [0, 1]: (0,0) = top-left corner, (0.5,0) = top-centre,
   * (1,0.5) = right-centre, etc.
   */
  cardPortX?: number;
  cardPortY?: number;
};

export type ShapeAnnotation = BaseAnnotation & {
  tool: 'arrow' | 'rect' | 'ellipse';
  start: Point;
  end: Point;
  fill?: boolean;
};

export type PencilAnnotation = BaseAnnotation & {
  tool: 'pencil';
  points: Point[];
};

export type TextAnnotation = BaseAnnotation & {
  tool: 'text';
  start: Point;
  end: Point;
  label: string;
};

export type Annotation = ShapeAnnotation | PencilAnnotation | TextAnnotation;

export type SnapmarkSettings = {
  color: string;
  lineWidth: number;
  shapeFill: boolean;
  copyCloses: boolean;
};

export const DEFAULT_SETTINGS: SnapmarkSettings = {
  color: ANNOTATION_CORAL,
  lineWidth: 4,
  shapeFill: false,
  copyCloses: true,
};

export type StartMessage = { type: 'SNAPMARK_START'; dataUrl: string };
export type BeginSelectionMessage = { type: 'SNAPMARK_BEGIN_SELECTION' };
export type CaptureRegionMessage = { type: 'SNAPMARK_CAPTURE_REGION' };
export type CaptureRegionResponse = { ok: true; dataUrl: string } | { ok: false; error: string };
export type ExportMessage = {
  type: 'SNAPMARK_EXPORT';
  action: 'copy' | 'save';
  dataUrl: string;
  filename?: string;
};
export type CloseMessage = { type: 'SNAPMARK_CLOSE' };
export type OffscreenCopyMessage = { type: 'SNAPMARK_COPY_OFFSCREEN'; dataUrl: string };
export type OpenShortcutsMessage = { type: 'SNAPMARK_OPEN_SHORTCUTS' };
export type RuntimeMessage = StartMessage | BeginSelectionMessage | CaptureRegionMessage | ExportMessage | CloseMessage | OffscreenCopyMessage | OpenShortcutsMessage;

export function makeId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function exportFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `snapmark-${stamp}.png`;
}

export async function readSettings(): Promise<SnapmarkSettings> {
  if (typeof chrome === 'undefined' || !chrome.storage) return DEFAULT_SETTINGS;
  const saved = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...saved } as SnapmarkSettings;
}
