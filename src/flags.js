// Inline SVG flags for the translation picker. Emoji flags don't render on
// Windows (you get "IT" instead of 🇮🇹), so we draw simplified flags with a
// handful of primitives. A language maps to the flag of the country most
// associated with it — an approximation, like every language→flag mapping.

const W = 60;
const H = 40;

const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const poly = (points, fill, extra = '') => `<polygon points="${points}" fill="${fill}" ${extra}/>`;

const horizontal = (...colors) => colors.map((c, i) => rect(0, (i * H) / colors.length, W, H / colors.length + 0.5, c)).join('');
const vertical = (...colors) => colors.map((c, i) => rect((i * W) / colors.length, 0, W / colors.length + 0.5, H, c)).join('');
const nordic = (bg, fg, inner) =>
  rect(0, 0, W, H, bg) +
  rect(16, 0, 8, H, fg) + rect(0, 16, W, 8, fg) +
  (inner ? rect(18, 0, 4, H, inner) + rect(0, 18, W, 4, inner) : '');

function star(cx, cy, r, fill, rotate = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2 + (rotate * Math.PI) / 180;
    const rr = i % 2 ? r * 0.38 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return poly(pts.join(' '), fill);
}

const FLAGS = {
  it: () => vertical('#009246', '#ffffff', '#ce2b37'),
  de: () => horizontal('#000000', '#dd0000', '#ffce00'),
  fr: () => vertical('#0055a4', '#ffffff', '#ef4135'),
  es: () => rect(0, 0, W, H, '#aa151b') + rect(0, 10, W, 20, '#f1bf00'),
  pt: () => rect(0, 0, 24, H, '#006600') + rect(24, 0, 36, H, '#ff0000') + circle(24, 20, 7.5, '#ffe000') + circle(24, 20, 4.5, '#ff0000') + circle(24, 20, 2.5, '#ffffff'),
  nl: () => horizontal('#ae1c28', '#ffffff', '#21468b'),
  pl: () => horizontal('#ffffff', '#dc143c'),
  ro: () => vertical('#002b7f', '#fcd116', '#ce1126'),
  el: () =>
    Array.from({ length: 9 }, (_, i) => rect(0, (i * H) / 9, W, H / 9 + 0.5, i % 2 ? '#ffffff' : '#0d5eaf')).join('') +
    rect(0, 0, 22.5, 22.5, '#0d5eaf') + rect(9.5, 0, 3.5, 22.5, '#ffffff') + rect(0, 9.5, 22.5, 3.5, '#ffffff'),
  tr: () => rect(0, 0, W, H, '#e30a17') + circle(22, 20, 10, '#ffffff') + circle(24.5, 20, 8, '#e30a17') + star(33, 20, 5, '#ffffff', 18),
  cs: () => horizontal('#ffffff', '#d7141a') + poly(`0,0 30,20 0,${H}`, '#11457e'),
  sv: () => nordic('#006aa7', '#fecc00'),
  da: () => nordic('#c8102e', '#ffffff'),
  nb: () => nordic('#ba0c2f', '#ffffff', '#00205b'),
  fi: () => nordic('#ffffff', '#003580'),
  hu: () => horizontal('#ce2939', '#ffffff', '#477050'),
  ru: () => horizontal('#ffffff', '#0039a6', '#d52b1e'),
  uk: () => horizontal('#005bbb', '#ffd500'),
  ar: () => rect(0, 0, W, H, '#165d31') + rect(12, 14, 36, 4.5, '#ffffff') + rect(12, 23, 30, 3, '#ffffff') + rect(44, 22, 4, 5, '#ffffff'),
  he: () =>
    rect(0, 0, W, H, '#ffffff') + rect(0, 5, W, 5, '#0038b8') + rect(0, 30, W, 5, '#0038b8') +
    poly('30,11 38.5,25 21.5,25', 'none', 'stroke="#0038b8" stroke-width="1.8" stroke-linejoin="round"') +
    poly('30,29 21.5,15 38.5,15', 'none', 'stroke="#0038b8" stroke-width="1.8" stroke-linejoin="round"'),
  hi: () => horizontal('#ff9933', '#ffffff', '#138808') + circle(30, 20, 5, 'none', 'stroke="#000080" stroke-width="1.6"') + circle(30, 20, 1, '#000080'),
  'zh-CN': () => rect(0, 0, W, H, '#de2910') + star(12, 13, 7.5, '#ffde00') + star(23, 6, 2.4, '#ffde00') + star(27, 11, 2.4, '#ffde00') + star(27, 17, 2.4, '#ffde00') + star(23, 22, 2.4, '#ffde00'),
  ja: () => rect(0, 0, W, H, '#ffffff') + circle(30, 20, 10, '#bc002d'),
  ko: () =>
    rect(0, 0, W, H, '#ffffff') +
    `<path d="M20 20 a10 10 0 0 1 20 0 a5 5 0 0 1 -10 0 a5 5 0 0 0 -10 0" fill="#cd2e3a"/>` +
    `<path d="M20 20 a10 10 0 0 0 20 0 a5 5 0 0 0 -10 0 a5 5 0 0 1 -10 0" fill="#0047a0"/>` +
    [[5, 5], [45, 5], [5, 29], [45, 29]].map(([x, y]) => [0, 2.5, 5].map((dy) => rect(x, y + dy, 10, 1.4, '#000000')).join('')).join(''),
};

/** SVG markup for the flag associated with a language code, or '' if none. */
export function flagSvg(code) {
  const draw = FLAGS[code];
  if (!draw) return '';
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${draw()}</svg>`;
}
