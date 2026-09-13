/** Static, author-controlled SVG icons. Never receives external input. */
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(children: string, className?: string): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  if (className) el.setAttribute('class', className);
  // Static markup authored in this file only.
  el.innerHTML = children;
  return el;
}

export const icons = {
  chat: () => svg('<path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.3-4A8 8 0 1 1 21 12z"/>', 'icon-chat'),
  close: () => svg('<path d="M18 6 6 18M6 6l12 12"/>', 'icon-close'),
  send: () => svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  stop: () => svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  sparkle: () =>
    svg(
      '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    ),
  copy: () =>
    svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  check: () => svg('<path d="M20 6 9 17l-5-5"/>'),
  refresh: () => svg('<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>'),
  trash: () => svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
};
