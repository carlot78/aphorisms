// "My collection": passages the user sends in from other apps (share sheet,
// bookmarklet, iOS Shortcut) or imports from a Kindle "My Clippings.txt".
// Pure helpers — storage and UI live in app.js.

const URL_RE = /https?:\/\/[^\s<>"“”]+/g;

const stripQuotes = (s) => s.trim().replace(/^[“"'«„‘]+/, '').replace(/[”"'»“’]+$/, '').trim();

/**
 * Normalise what a share sheet hands us. Apps differ a lot: Chrome's
 * "share highlight" sends `"text"\n<url#:~:text=…>`, Kindle sends the
 * highlight followed by "Book by Author" and a link, some apps put the page
 * title in `title`, others repeat the text there.
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
  if (!body && title) { body = stripQuotes(title); title = ''; }
  if (!attribution && title && title !== body) attribution = title;
  if (!attribution && url) {
    try { attribution = new URL(url).hostname.replace(/^www\./, ''); } catch { /* not a URL */ }
  }
  return { text: body, attribution, url: url || '' };
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
