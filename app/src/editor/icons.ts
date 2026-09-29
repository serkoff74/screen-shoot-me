const paths: Record<string, string> = {
  select: '<path d="M7 4.5l10 10.5l-4.5 .5l-2.5 4.5z"/><path d="M13 13l6 6"/>',
  arrow: '<path d="M17 7l-10 10"/><path d="M8 7h9v9"/>',
  rect: '<path d="M5 3m0 2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14h-14z"/>',
  ellipse: '<path d="M3 12c0-3.314 4.03-6 9-6s9 2.686 9 6s-4.03 6-9 6s-9-2.686-9-6z"/>',
  pencil: '<path d="M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
  text: '<path d="M7 4h10"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  undo: '<path d="M9 14l-4-4l4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/>',
  redo: '<path d="M15 14l4-4l-4-4"/><path d="M19 10h-11a4 4 0 1 0 0 8h1"/>',
  copy: '<path d="M8 8m-2 0a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/><path d="M16 6v-1a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1"/>',
  save: '<path d="M12 3v12"/><path d="M16 11l-4 4l-4-4"/><path d="M5 21h14"/>',
  close: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  check: '<path d="M5 12l5 5l10-10"/>',
  grip: '<path d="M9 5v.01"/><path d="M9 12v.01"/><path d="M9 19v.01"/><path d="M15 5v.01"/><path d="M15 12v.01"/><path d="M15 19v.01"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 14h12l1-14"/><path d="M9 7v-3h6v3"/>',
};

export function icon(name: keyof typeof paths): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
