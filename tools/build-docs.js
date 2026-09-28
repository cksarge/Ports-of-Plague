// Builds the printable documents from the game's own data files:
//   docs/Ports-of-Plague-Rule-Book.html / .pdf        (same source as the in-game Rules)
//   docs/Ports-of-Plague-Research-Sheet.html / .pdf   (sources in MLA + fact table + debates)
//   docs/Ports-of-Plague-Presentation-Outline.md / .html / .pdf
// PDFs are printed with Google Chrome in headless mode (US Letter).
//   npm run docs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DATA, FACTS, SOURCES, CITIES } from '../src/data.js';
import { renderRulebook } from '../src/render/rulebook.js';
import { factUsage } from '../src/render/usage.js';
import { escapeHtml as esc, inlineMarkup } from '../src/render/template.js';

const root = new URL('..', import.meta.url);
const docs = new URL('docs/', root);
mkdirSync(docs, { recursive: true });
// All finished, print-ready PDFs go in one clearly labelled folder.
const pdfDir = new URL('Printable%20Documents%20(PDF)/', root);
mkdirSync(pdfDir, { recursive: true });
const C = DATA.config;

function fontFaces() {
  const f = (family, file, weight = 400, style = 'normal') =>
    `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${readFileSync(new URL(`assets/fonts/${file}`, root)).toString('base64')}) format('woff2');font-weight:${weight};font-style:${style}}`;
  return [
    f('EB Garamond', 'eb-garamond-latin-400-normal.woff2'),
    f('EB Garamond', 'eb-garamond-latin-400-italic.woff2', 400, 'italic'),
    f('EB Garamond', 'eb-garamond-latin-600-normal.woff2', 600),
    f('Cinzel', 'cinzel-latin-800-normal.woff2', 800),
    f('Unifraktur', 'unifrakturmaguntia-latin-400-normal.woff2'),
  ].join('\n');
}
const FONTS = fontFaces();
const PRINT_CSS = readFileSync(new URL('src/styles/print.css', root), 'utf8');

function page(title, docLabel, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${FONTS}\n${PRINT_CSS}\n@page { @top-right { content: "${docLabel}"; } }</style></head>
<body><div class="print-tip">To print: File → Print, paper size US Letter, margins “Default”, turn <strong>off</strong> “Headers and footers”, turn <strong>on</strong> “Background graphics”. A ready-made PDF is in the same folder.</div>
${body}</body></html>`;
}

// ---------- Rule Book ----------
function ruleBook() {
  const body = renderRulebook(DATA.rulebook, C, { factRef: (id) => `<sup class="fact-ref">${id}</sup>`, level: 2 });
  return page('Ports of Plague — Rule Book', 'Rule Book', `
  <header class="doc-head"><h1 class="doc-title">Ports of Plague</h1>
  <p class="doc-sub">${esc(DATA.rulebook.subtitle)} · Rule Book · ${C.players.min}–${C.players.max} players · about ${C.timeEstimates.quick['2']}–60 minutes · ages 14+</p></header>
  <div class="two-col">${body}
  <p class="small"><em>Small grey codes such as <span class="fact-ref">TR-02</span> point to the sourced facts listed in the Historical Research Sheet. The in-game Rules screen shows exactly this text; both are generated from <code>data/rulebook.json</code> and <code>data/config.json</code>.</em></p></div>`);
}

// ---------- Research Sheet ----------
function sortKey(s) {
  return s.mla.replace(/^[\s"“*]+/, '').toLowerCase();
}

const SHORT = { trade: 'Trade routes', timeline: 'Timeline', cities: 'Cities & regions', social: 'Social responses', economic: 'Economy', medical: 'Medicine', church: 'Church' };
const PRIORITY = ['Chronicle card', 'Event card', 'Action', 'Physician remedy', 'City', 'Plague arrival', 'Round banner', 'Prologue', 'End-of-game summary', 'Rule Book', 'Route'];
const rank = (u) => { const i = PRIORITY.findIndex((p) => u.startsWith(p)); return i < 0 ? 99 : i; };

function researchSheet() {
  const usage = factUsage(DATA);
  for (const id of Object.keys(usage)) usage[id].sort((a, b) => rank(a) - rank(b));
  const sources = [...DATA.sources].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const num = Object.fromEntries(sources.map((s, i) => [s.id, i + 1]));
  const works = sources.map((s) => `<p id="src-${s.id}">[${num[s.id]}] ${inlineMarkup(esc(s.mla))}</p>`).join('');
  const cats = DATA.categories;
  const counts = Object.fromEntries(Object.keys(cats).map((c) => [c, DATA.facts.filter((f) => f.category === c).length]));
  const rows = Object.keys(cats).map((cat) => {
    const facts = DATA.facts.filter((f) => f.category === cat);
    return `<tr><th colspan="4" style="background:#f6ecd2">${esc(cats[cat])} (${facts.length} facts)</th></tr>` + facts.map((f) =>
      `<tr><td>${f.id}</td><td>${esc(f.text)}${f.debate ? ` <span class="debate">Debated: ${esc(f.debate)}</span>` : ''}${f.when || f.where ? `<br><span class="small">${esc([f.when, f.where].filter(Boolean).join(' · '))}</span>` : ''}</td>
      <td>${f.sources.map((s) => `[${num[s]}]`).join(' ')}</td><td class="small">${esc((usage[f.id] ?? []).slice(0, 4).join('; '))}${(usage[f.id] ?? []).length > 4 ? `; +${usage[f.id].length - 4} more` : ''}</td></tr>`).join('');
  }).join('');
  const debated = DATA.facts.filter((f) => f.debate);
  const types = {};
  for (const s of DATA.sources) types[s.type] = (types[s.type] ?? 0) + 1;
  return page('Ports of Plague — Historical Research Sheet', 'Historical Research Sheet', `
  <header class="doc-head"><h1 class="doc-title">Ports of Plague</h1><p class="doc-sub">Historical Research Sheet · the sources and facts behind the game</p></header>
  <h2>How the history was built into the game</h2>
  <p>Every historical claim in <em>Ports of Plague</em> (on cards, in city pop-ups, in the rules and in the end-of-game summary) is stored as a numbered fact in one file, <code>data/facts.json</code>. Each fact lists at least one source and a short supporting quotation. An automatic audit (<code>npm run audit</code>) checks that every card, city, route and rule points to a real fact, that every fact has a source, and that the rule numbers match the game. The game uses <strong>${DATA.facts.length} facts</strong> from <strong>${DATA.sources.length} sources</strong>, covering all seven required topics:</p>
  <table><thead><tr>${Object.keys(cats).map((c) => `<th>${esc(SHORT[c])}</th>`).join('')}</tr></thead><tbody><tr>${Object.keys(cats).map((c) => `<td style="text-align:center">${counts[c]}</td>`).join('')}</tr></tbody></table>
  <p class="small">Source types: ${Object.entries(types).map(([t, n]) => `${n} ${esc(t)}`).join(', ')}. The plague arrival date for each of the ${DATA.cities.length} cities on the map comes from these sources; where sources disagree, the game uses one date and shows the other in the city's pop-up.</p>

  <h2>Historical debates and uncertainties</h2>
  <div class="box">
  <p><strong>How many died?</strong> Britannica estimates about 25 million deaths in Europe, roughly one-third of the population, close to the chronicler Froissart's figure. Historian Ole Benedictow, after collecting many local studies, argues for about 60 percent (around 50 million). Death rates also varied greatly by region. <span class="fact-ref">DB-01 CI-06</span></p>
  <p><strong>Rats or people?</strong> The traditional explanation is fleas carried by black rats. A 2018 study in <em>PNAS</em> found that human fleas and body lice fit death records from nine outbreaks better. Ancient DNA has confirmed that the bacterium <em>Yersinia pestis</em> caused the Black Death, but scientists still disagree about how it passed from person to person. <span class="fact-ref">ME-10 ME-01</span></p>
  <p><strong>The siege of Caffa.</strong> The story that attackers threw plague corpses over the walls comes from one writer, Gabriele de' Mussi. A modern analysis finds it plausible, but concludes the siege was only one of several routes out of the Black Sea. <span class="fact-ref">TR-03</span></p>
  <p><strong>Dates and places.</strong> Sources disagree by weeks or months on when the plague reached some cities (Genoa: November 1347 or January 1348; Melcombe Regis: June or August 1348). Old maps also wrongly showed regions like the Low Countries as "spared" because of gaps in the evidence. <span class="fact-ref">TL-04 TR-08 CI-12</span></p>
  <p><strong>Chroniclers' numbers.</strong> Medieval writers often exaggerated. For Florence alone they give 60,000 or 100,000 deaths, or three in five people. Numbers like these are treated as rough impressions, not counts. <span class="fact-ref">CI-02</span></p>
  <p><strong>Anachronisms the game avoids.</strong> Formal quarantine (Ragusa, 1377, 30 days; later 40 days in Venice) came after 1353, so it appears only as "what came next". Earlier, haphazard measures (Venice's ship checks, Pistoia's travel ban, Milan's boarded-up houses) are used instead. The beaked "plague doctor" mask dates from 1619 and is left out. <span class="fact-ref">ME-12 ME-14 ME-15 ME-11</span></p>
  <p><strong>Persecution.</strong> The game shows the persecution of Jewish communities because it happened, and it states plainly that the well-poisoning accusations were false and the violence unjust. Pope Clement VI condemned the accusations, but his words had little effect far from Avignon. Players can never gain anything from persecution. <span class="fact-ref">SO-07 SO-08 SO-09</span></p>
  <p class="small">Facts marked as debated in the table below: ${debated.map((f) => f.id).join(', ')}.</p>
  </div>

  <h2>Key facts, their sources, and where they appear in the game</h2>
  <table class="facts-table"><thead><tr><th>ID</th><th>Fact</th><th>Source(s)</th><th>Where in the game</th></tr></thead><tbody>${rows}</tbody></table>

  <h2>Works Cited</h2>
  <div class="works-cited">${works}</div>
  <p class="small">All web sources were accessed on ${esc(DATA.accessed)}. Map data: Natural Earth (public domain). Fonts: EB Garamond, Cinzel, UnifrakturMaguntia (SIL Open Font License).</p>`);
}

// ---------- Presentation outline ----------
function presentationMarkdown() {
  const homes = DATA.cities.filter((c) => c.home).map((c) => c.name).join(', ');
  return `# Ports of Plague — 5-Minute Presentation Outline

*Talking points for presenting the game to the class. Times are a guide; aim for about 5 minutes total, then take questions.*

## 1. Hook (0:00–0:30)
- "In October 1347, twelve Genoese galleys sailed into the harbor of Messina in Sicily, carrying a disease that would kill somewhere between a third and 60 percent of Europe." [TR-06, DB-01]
- "Our game asks: if you were a merchant then, would you keep trading?"

## 2. What the game is (0:30–1:15)
- *Ports of Plague* is a board game played on one computer by ${C.players.min}–${C.players.max} players, taking turns (hot seat). It has a painted map board, ships and carts sailing the trade routes, dice, cards and house banners, all animated.
- Each player is a merchant family based in a real trading city (${homes}). A dice roll at the start sets the turn order for the whole game.
- ${C.rounds} rounds of half a year each (Late 1347 to Early 1353), or 6 rounds of a whole year in **Quick Play**. Three difficulties, from Apprentice to Great Mortality. About ${C.timeEstimates.quick['2']}–60 minutes.
- **Goal:** the highest *Legacy* in 1353 = Wealth + Family + Reputation, plus your weakest category again. **Balance beats greed.**

## 3. How it plays: strategy and chance (1:15–2:15)
- On your turn you spend ${C.modes.standard.actionPoints} action points (${C.modes.quick.actionPoints} in Quick Play): ship goods, open trading posts, move or protect your family, consult a physician, or give to charity.
- **Merchant's Ledger:** once the plague has passed a city, you can arrange a marriage or buy abandoned land there. You can also take a loan, propose a partnership to another house, or close your city's gates to rivals. [SO-12, EC-02, EC-01, TR-04, SO-11]
- **Fortune cards:** roll a ${C.fortune.drawOnProfitDie} on the profit die or open a trading post and you draw a personal card (spice cargoes, extra actions, warnings of where the plague goes next, but also illness and nervous creditors), so no two players' games are the same.
- **Chance:** a profit die, a contagion die (infected cargo), a severity die for each stricken city, and survival dice for family members.
- **Strategy:** sea routes pay more, but cargo from a stricken city can carry the plague, even bringing it to the next city one round early. Fleeing keeps your family safe but costs reputation. Paying to hold a ship offshore, as Venice made ships wait in 1348, stops infected cargo from spreading. [ME-12]
- Comeback rules: inheritance, weddings, loans, cheaper charity, and Guild's Favor (an extra action for a house far behind). No one is ever eliminated.

## 4. The history inside the game (2:15–3:45)
- **Real timeline and trade routes:** the plague reaches each of the ${DATA.cities.length} cities in the half-year it really did (Messina Oct 1347, Florence 1348, London Aug 1348, Bergen July 1349, Moscow 1353). [TR-06, TL-08, TR-09, TR-10]
- **Social responses:** flight to the countryside (Boccaccio), the flagellants, and Pope Clement VI banning them in 1349. [SO-04, SO-02, SO-03]
- **Persecution, handled seriously:** the Strasbourg massacre of February 1349 happened before the plague even arrived. The game states that the accusations were false, and players can only lose money by trying to protect the community, never gain. [SO-09, SO-07, SO-08]
- **Economy:** labor shortages raised wages and prices; England's Ordinance (1349) and Statute of Labourers (1351) tried to freeze wages and failed. [EC-03, EC-05, EC-06, EC-07]
- **Medicine:** the Paris Medical Faculty blamed the planets and "corrupt air"; physicians admitted they were helpless. The physician action shows real remedies such as bloodletting and figs and onions, and admits they did nothing. [ME-04, ME-06, ME-08]
- **The Church:** a quarter of the pope's court died; so many priests died that a bishop let the dying confess to laypeople, "even to a woman". [CH-02, CH-05]

## 5. Accuracy and research (3:45–4:30)
- ${DATA.facts.length} facts from ${DATA.sources.length} sources (Britannica, peer-reviewed journals such as *Nature* and *PNAS*, university sites, and primary sources like Boccaccio and Guy de Chauliac). Every fact in the game is tied to a source.
- We show where historians disagree: the death toll, rats versus human fleas, and conflicting dates. [DB-01, ME-10, TL-04]
- We avoided anachronisms: no beaked plague-doctor masks (invented 1619), and quarantine appears only as "what came next" (Ragusa, 1377). [ME-11, ME-14]

## 6. Balance and testing (4:30–4:50)
- We tested the rules with thousands of computer-played games. Every home city wins about its fair share, and a balanced strategy beats pure greed. Full results are in \`docs/simulation-report.md\`.

## 7. Close (4:50–5:00)
- "In *Ports of Plague* you can't stop the Black Death. You can only decide what kind of family you'll be when it comes. That was true in 1348, too."
- Invite classmates to play; the Rule Book and Research Sheet are printed and available.

---
*Fact codes in brackets refer to the Historical Research Sheet.*
`;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '', inList = false;
  const inline = (t) => inlineMarkup(esc(t)).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([A-Z]{2}-\d{2}(?:, [A-Z]{2}-\d{2})*)\]/g, '<span class="fact-ref">[$1]</span>');
  for (const l of lines) {
    if (l.startsWith('- ')) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(l.slice(2))}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (l.startsWith('# ')) html += `<header class="doc-head"><h1 class="doc-title">Ports of Plague</h1><p class="doc-sub">5-Minute Presentation Outline</p></header>`;
    else if (l.startsWith('## ')) html += `<h2>${inline(l.slice(3))}</h2>`;
    else if (l.startsWith('---')) html += '<hr>';
    else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

// ---------- PDF printing ----------
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

function toPdf(htmlFile, pdfFile) {
  if (!CHROME) return false;
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--no-first-run', `--print-to-pdf=${fileURLToPath(pdfFile)}`, pathToFileURL(fileURLToPath(htmlFile)).href], { stdio: 'ignore' });
  return true;
}

function pdfPages(pdfFile) {
  const buf = readFileSync(pdfFile).toString('latin1');
  return (buf.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

const outputs = [
  ['Ports-of-Plague-Rule-Book', ruleBook()],
  ['Ports-of-Plague-Research-Sheet', researchSheet()],
  ['Ports-of-Plague-Presentation-Outline', page('Ports of Plague — Presentation Outline', 'Presentation Outline', mdToHtml(presentationMarkdown()))],
];
writeFileSync(new URL('Ports-of-Plague-Presentation-Outline.md', docs), presentationMarkdown());
for (const [name, html] of outputs) {
  const h = new URL(`${name}.html`, docs), p = new URL(`${name}.pdf`, pdfDir);
  writeFileSync(h, html);
  if (toPdf(h, p)) console.log(`${name}.pdf: ${pdfPages(p)} page(s)`);
  else console.log(`${name}.html written (Chrome not found: open it in a browser and print to PDF).`);
}
console.log('HTML versions written to docs/; PDFs written to "Printable Documents (PDF)/".');
