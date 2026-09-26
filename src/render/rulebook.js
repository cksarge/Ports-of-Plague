// Renders data/rulebook.json to HTML. The SAME function builds the in-game
// Rules screen and the printable Rule Book, so they can never differ.
import { fillTemplate, inlineMarkup, escapeHtml } from './template.js';

export function renderRulebook(rulebook, config, { factRef = (id) => `<sup class="fact-ref">${id}</sup>`, level = 2 } = {}) {
  // Escape the text first, then apply markup and placeholders (fact refs produce HTML).
  const fmt = (text) => {
    const marker = (id) => `\u0000${id}\u0000`;
    const filled = fillTemplate(text, config, { factRef: marker });
    return inlineMarkup(escapeHtml(filled)).replace(/\u0000([A-Z]{2}-\d{2})\u0000/g, (_, id) => factRef(id));
  };
  const h = `h${level}`;
  const out = [];
  for (const sec of rulebook.sections) {
    out.push(`<section class="rules-section" id="rules-${sec.id}">`);
    out.push(`<${h}>${escapeHtml(sec.title)}</${h}>`);
    for (const b of sec.blocks) {
      switch (b.type) {
        case 'p':
          out.push(`<p>${fmt(b.text)}</p>`);
          break;
        case 'note':
          out.push(`<p class="rules-note">${fmt(b.text)}</p>`);
          break;
        case 'list': {
          const tag = b.ordered ? 'ol' : 'ul';
          out.push(`<${tag}>${b.items.map((i) => `<li>${fmt(i)}</li>`).join('')}</${tag}>`);
          break;
        }
        case 'table':
          out.push('<table class="rules-table"><thead><tr>' + b.head.map((c) => `<th scope="col">${fmt(c)}</th>`).join('') + '</tr></thead><tbody>' +
            b.rows.map((r) => '<tr>' + r.map((c, i) => (i === 0 ? `<th scope="row">${fmt(c)}</th>` : `<td>${fmt(c)}</td>`)).join('') + '</tr>').join('') + '</tbody></table>');
          break;
        case 'defs':
          out.push('<dl class="rules-defs">' + b.items.map(([t, d]) => `<div><dt>${fmt(t)}</dt><dd>${fmt(d)}</dd></div>`).join('') + '</dl>');
          break;
        default:
          throw new Error(`Unknown rulebook block ${b.type}`);
      }
    }
    out.push('</section>');
  }
  return out.join('\n');
}
