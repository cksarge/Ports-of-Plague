// Historical Notes: every historical fact shown in the game is rendered
// from facts.json with its source, so nothing appears unsourced.
import { FACTS, SOURCES, DATA } from '../data.js';
import { esc } from './dom.js';

function shortCite(sourceId) {
  const s = SOURCES[sourceId];
  if (!s) return sourceId;
  // First part of the MLA citation (author and title) is enough on screen.
  const plain = s.mla.replace(/\*/g, '');
  const m = plain.match(/^(.*?\.\s*".*?")/);
  return m ? m[1] : plain.split('. ').slice(0, 2).join('. ');
}

export function factHtml(id, { showId = true } = {}) {
  const f = FACTS[id];
  if (!f) return '';
  const cites = f.sources.map((s) => `<a href="${esc(SOURCES[s]?.url ?? '#')}" target="_blank" rel="noopener">${esc(shortCite(s))}</a>`).join('; ');
  return `<div class="fact">${showId ? `<span class="fact-id">${esc(f.id)}</span>` : ''}${esc(f.text)}` +
    (f.debate ? `<span class="debate">Historians disagree: ${esc(f.debate)}</span>` : '') +
    `<span class="cite">Source: ${cites}</span></div>`;
}

export function noteHtml(factIds, title = 'Historical Note') {
  const ids = [...new Set(factIds ?? [])].filter((id) => FACTS[id]);
  if (!ids.length) return '';
  return `<aside class="note" aria-label="${esc(title)}"><h3>📜 ${esc(title)}</h3>${ids.map((id) => factHtml(id)).join('')}</aside>`;
}

export function journalHtml(journal) {
  const byCat = {};
  for (const id of journal) {
    const f = FACTS[id];
    if (f) (byCat[f.category] ||= []).push(id);
  }
  const total = DATA.facts.length;
  let html = `<p>You have met <strong>${journal.length}</strong> of the ${total} historical facts in the game.</p>`;
  for (const [cat, label] of Object.entries(DATA.categories)) {
    const ids = byCat[cat] ?? [];
    html += `<section class="journal-cat"><h3>${esc(label)} (${ids.length})</h3>${ids.length ? ids.map((id) => factHtml(id)).join('') : '<p><em>Not yet discovered.</em></p>'}</section>`;
  }
  return html;
}
