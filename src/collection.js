// "My collection": passages the user sends in from other apps (share sheet,
// bookmarklet, iOS Shortcut) or imports from a Kindle "My Clippings.txt".
// Pure helpers — storage and UI live in app.js.

const URL_RE = /https?:\/\/[^\s<>"“”]+/g;

const stripQuotes = (s) => s.trim().replace(/^[“"'«„‘]+/, '').replace(/[”"'»“’]+$/, '').trim();

/**
 * Read the highlighted text back out of a Chrome "link to highlight"
 * (`#:~:text=[prefix-,]start[,end][,-suffix]`). Returns '' if there is none,
 * and `partial: true` when only the start and end of a long selection are in
 * the link (Chrome elides the middle).
 */
export function textFromFragment(url) {
  const i = String(url || '').indexOf(':~:');
  if (i < 0) return { text: '', partial: false };
  const directive = url.slice(i + 3).split('&').find((d) => d.startsWith('text='));
  if (!directive) return { text: '', partial: false };
  const parts = directive.slice(5).split(',').filter((p) => p && !p.endsWith('-') && !p.startsWith('-'));
  const dec = (p) => { try { return decodeURIComponent(p); } catch { return p; } };
  if (parts.length === 1) return { text: dec(parts[0]).trim(), partial: false };
  if (parts.length === 2) return { text: `${dec(parts[0]).trim()} … ${dec(parts[1]).trim()}`, partial: true };
  return { text: '', partial: false };
}

/**
 * Normalise what a share sheet hands us. Apps differ a lot: Chrome's
 * selection toolbar sends `"text"\n<url#:~:text=…>`, Chrome's page menu
 * sends only title + URL (no selection), Kindle sends the highlight followed
 * by "Book by Author" and a link.
 *
 * Returns `{ text, attribution, url, kind }` where kind is 'selection',
 * 'fragment' (recovered from a highlight link), 'partial' (fragment with the
 * middle missing) or 'page' (nothing selected — only the page was shared).
 */
export function parseShared({ title = '', text = '', url = '' } = {}) {
  let body = String(text || '').replace(/\r\n?/g, '\n');
  const urls = body.match(URL_RE) || [];
  if (!url && urls.length) url = urls[urls.length - 1];
  body = body.replace(URL_RE, '').replace(/[ \t]+\n/g, '\n').trim();

  let attribution = '';
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length > 1) {
    const last = paras[paras.length - 1];
    if (last.length <= 140 && /(^from[: ]|^—|^-\s|\sby\s|^\(.*\)$)/i.test(last)) {
      attribution = last.replace(/^(from:?|—|-)\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
      paras.pop();
    }
  }
  body = stripQuotes(paras.join('\n\n'));
  title = String(title || '').trim();

  let kind = 'selection';
  // Only the page was shared: the "text" is empty or just the page title.
  if (!body || (title && stripQuotes(title) === body)) {
    const frag = textFromFragment(url);
    body = frag.text;
    kind = frag.text ? (frag.partial ? 'partial' : 'fragment') : 'page';
  }

  if (!attribution && title && title !== body) attribution = title;
  if (!attribution && url) {
    try { attribution = new URL(url).hostname.replace(/^www\./, ''); } catch { /* not a URL */ }
  }
  return { text: body, attribution, url: url || '', kind };
}

/** Parse a Kindle "My Clippings.txt" into highlights (bookmarks skipped). */
export function parseClippings(fileText) {
  const out = [];
  const seen = new Set();
  for (const block of fileText.replace(/^﻿/, '').split(/\r?\n={5,}\r?\n?/)) {
    const lines = block.replace(/^﻿/, '').split(/\r?\n/);
    const head = (lines[0] || '').trim();
    const meta = lines[1] || '';
    const body = lines.slice(2).join('\n').trim();
    if (!head || !body) continue;
    if (/bookmark|lesezeichen|segnalibro|marque-page|marcador/i.test(meta)) continue;
    const key = body.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue; // Kindle appends a new entry every time a highlight is edited
    seen.add(key);
    const m = head.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    const attribution = m ? `${m[2].trim()}, ${m[1].trim()}` : head;
    out.push({ text: body, attribution, url: '' });
  }
  return out;
}

/** A bookmarklet that sends the current selection (or page title) to the app. */
export function bookmarklet(appUrl) {
  const js = `(function(){var s=String(getSelection()).trim();window.open('${appUrl}?share&text='+encodeURIComponent(s)+'&title='+encodeURIComponent(document.title)+'&url='+encodeURIComponent(location.href),'_blank');})()`;
  return 'javascript:' + encodeURIComponent(js);
}
