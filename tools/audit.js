// Accuracy audit for Ports of Plague.
// Cross-checks every historical reference in the game data against the
// facts database and the sources list, and checks the rule text against
// config.json. Writes docs/audit-report.md. Exits with code 1 on errors.
import { writeFileSync, mkdirSync } from 'node:fs';
import { DATA, FACTS, SOURCES, CITIES } from '../src/data.js';
import { placeholders, lookup } from '../src/render/template.js';
import { factUsage, sectionTexts, routeName } from '../src/render/usage.js';
import { EFFECT_TYPES } from '../src/engine/events.js';
import { FORTUNE_EFFECTS } from '../src/engine/fortune.js';

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// 1. Facts and sources
const seen = new Set();
for (const f of DATA.facts) {
  if (seen.has(f.id)) err(`Duplicate fact ID ${f.id}`);
  seen.add(f.id);
  if (!DATA.categories[f.category]) err(`Fact ${f.id} has unknown category "${f.category}"`);
  if (!f.sources?.length) err(`Fact ${f.id} has no source`);
  for (const s of f.sources ?? []) if (!SOURCES[s]) err(`Fact ${f.id} cites unknown source "${s}"`);
  if (!f.evidence) warn(`Fact ${f.id} has no supporting quote (evidence)`);
  if (!f.text?.trim()) err(`Fact ${f.id} has no text`);
}
const citedSources = new Set(DATA.facts.flatMap((f) => f.sources));
for (const s of DATA.sources) {
  if (!citedSources.has(s.id)) warn(`Source "${s.id}" is not cited by any fact`);
  if (!s.mla || !s.url) err(`Source "${s.id}" is missing its MLA citation or URL`);
}

// 2. Every reference in the game points at a real fact
const checkRefs = (ids, where) => {
  if (!ids?.length) err(`${where} has no fact reference (unsourced)`);
  for (const id of ids ?? []) if (!FACTS[id]) err(`${where} references unknown fact ${id}`);
};
for (const c of DATA.cities) {
  checkRefs(c.factIds, `City ${c.name}`);
  checkRefs(c.arrival.factIds, `Arrival date of ${c.name}`);
  if (!(c.arrival.round >= 0 && c.arrival.round <= DATA.config.rounds)) err(`City ${c.name} arrival round out of range`);
}
for (const r of DATA.routes) {
  if (!CITIES[r.a] || !CITIES[r.b]) err(`Route ${r.id} joins an unknown city`);
  checkRefs(r.factIds, `Route ${r.id}`);
}
for (const card of [...DATA.chronicle, ...DATA.deck]) {
  checkRefs(card.factIds, `Card "${card.title}"`);
  const types = card.effect.type === 'multi' ? card.effect.effects.map((e) => e.type) : [card.effect.type];
  for (const t of types) if (!EFFECT_TYPES.includes(t)) err(`Card "${card.title}" uses unknown effect type "${t}"`);
}
for (const card of DATA.fortune) {
  checkRefs(card.factIds, `Fortune card "${card.title}"`);
  if (!FORTUNE_EFFECTS.includes(card.effect.type)) err(`Fortune card "${card.title}" uses unknown effect type "${card.effect.type}"`);
}
for (const card of DATA.chronicle) {
  if (!(card.round >= 1 && card.round <= DATA.config.rounds)) err(`Chronicle card "${card.title}" has round out of range`);
}
for (const r of DATA.timeline.rounds) checkRefs(r.factIds, `Round banner ${r.label}`);
checkRefs(DATA.timeline.epilogue.factIds, 'End-of-game summary');
for (const a of DATA.actions) checkRefs(a.factIds, `Action ${a.name}`);
for (const r of DATA.remedies) checkRefs(r.factIds, `Remedy ${r.name}`);
if (DATA.timeline.rounds.length !== DATA.config.rounds) err('timeline.json round count does not match config.rounds');

// 3. Rule text placeholders resolve against config.json
for (const sec of DATA.rulebook.sections) {
  for (const text of sectionTexts(sec)) {
    for (const p of placeholders(text)) {
      if (p.startsWith('fact:')) {
        if (!FACTS[p.slice(5)]) err(`Rule Book "${sec.title}" references unknown fact ${p}`);
      } else {
        const v = lookup(DATA.config, p);
        if (v === undefined || typeof v === 'object') err(`Rule Book "${sec.title}" placeholder {{${p}}} not found in config.json`);
      }
    }
  }
}

// 3b. Numbers written directly in the Rule Book must match the game data.
const ruleText = DATA.rulebook.sections.flatMap(sectionTexts).join(' ');
const literal = (cond, msg) => { if (!cond) err(`Rule Book mismatch: ${msg}`); };
literal(ruleText.includes(`${DATA.cities.length} real cities`), `city count should be ${DATA.cities.length}`);
literal(ruleText.includes(`deck of ${DATA.deck.length}`), `event deck size should be ${DATA.deck.length}`);
const sevBands = (n) => Object.entries(DATA.config.plague.severityTable).filter(([, v]) => v === n).map(([k]) => Number(k));
for (const [n, name] of Object.entries(DATA.config.plague.severityNames)) {
  const b = sevBands(Number(n));
  literal(ruleText.includes(`${b[0]}–${b.at(-1)} **${name}**`), `severity band for ${name} should be ${b[0]}–${b.at(-1)}`);
}
for (const id of ['florence', 'pisa', 'barcelona']) literal(CITIES[id].severityMod === 1, `${CITIES[id].name} should add 1 to severity`);
literal(CITIES.bruges.severityMod === -1, 'Bruges should subtract 1 from severity');
literal(DATA.config.difficulty.apprentice.severityMod === -1, 'Apprentice should lower severity by 1');
for (const id of DATA.cities.filter((c) => c.home).map((c) => c.id)) literal(ruleText.includes(CITIES[id].name), `home city ${CITIES[id].name} missing from Setup`);

// 3c. Numbers in card text must match the card's actual effect.
function effectNumbers(e) {
  switch (e.type) {
    case 'multi': return e.effects.flatMap(effectNumbers);
    case 'lastPlaceBonus': return [e.florins];
    case 'loseIfRich': return [e.threshold, e.florins];
    case 'florinsPerPost': return [Math.abs(e.florins)];
    case 'postBonus': return [e.florins, e.reputation].filter((x) => x).map(Math.abs);
    case 'offer': return [e.cost?.florins].filter((x) => x && e.reveal);
    case 'charityBonus': case 'costModifier': case 'marketBonus': case 'contagionModifier': return [Math.abs(e.delta)];
    case 'roundModifier': return [Math.abs(e.profit)];
    case 'cityProfitModifier': return [Math.abs(e.profit)];
    case 'newFamily': return [e.minLost, e.gain].filter((x) => x !== undefined);
    case 'reputationIfOffer': return [Math.abs(e.reputation)];
    case 'reputationByFlight': return [Math.abs(e.stayed), Math.abs(e.fled)];
    case 'onePlayer': return effectNumbers(e.effect);
    case 'gain': return [e.florins, e.reputation].filter((x) => x).map(Math.abs);
    case 'nextShip': return e.profit ? [Math.abs(e.profit)] : [];
    case 'extraAP': return [Math.abs(e.ap)];
    case 'treaty': return [e.florins];
    case 'losePercent': return [e.percent];
    case 'personalCost': return [e.delta];
    default: return [];
  }
}
for (const card of [...DATA.chronicle, ...DATA.deck, ...DATA.fortune]) {
  for (const n of effectNumbers(card.effect)) {
    if (!new RegExp(`\\b${n}\\b`).test(card.text)) err(`Card "${card.title}": its text does not mention the number ${n} used by its effect`);
  }
}

// 4. Map checks: duplicate routes, connectivity, home cities
const pairKeys = new Set();
for (const r of DATA.routes) {
  const key = [r.a, r.b].sort().join('|');
  if (pairKeys.has(key)) err(`Duplicate route ${routeName(DATA, r)}`);
  pairKeys.add(key);
}
const adj = Object.fromEntries(DATA.cities.map((c) => [c.id, []]));
for (const r of DATA.routes) { adj[r.a].push(r.b); adj[r.b].push(r.a); }
const reached = new Set(['caffa']);
const stack = ['caffa'];
while (stack.length) for (const n of adj[stack.pop()]) if (!reached.has(n)) { reached.add(n); stack.push(n); }
for (const c of DATA.cities) if (!reached.has(c.id)) err(`City ${c.name} is not connected to the route network`);

// 5. Coverage
const usage = factUsage(DATA);
const unused = DATA.facts.filter((f) => !usage[f.id]);
for (const f of unused) warn(`Fact ${f.id} ("${f.title}") is not shown anywhere in the game`);
const perCategory = {};
for (const f of DATA.facts) perCategory[f.category] = (perCategory[f.category] ?? 0) + 1;
if (DATA.facts.length < 30) err(`Only ${DATA.facts.length} facts; the goal is 30 or more`);
const debated = DATA.facts.filter((f) => f.debate);

// Report
const lines = [
  '# Ports of Plague — Accuracy Audit',
  '',
  `Generated by \`npm run audit\` on ${new Date().toISOString().slice(0, 10)}.`,
  '',
  `- Facts: **${DATA.facts.length}** (${Object.entries(perCategory).map(([k, v]) => `${k} ${v}`).join(', ')})`,
  `- Sources: **${DATA.sources.length}**, all with MLA citations and URLs`,
  `- Facts shown in the game: **${DATA.facts.length - unused.length}** of ${DATA.facts.length}`,
  `- Facts marked as debated: **${debated.length}**`,
  `- Cities: ${DATA.cities.length} · Routes: ${DATA.routes.length} · Chronicle cards: ${DATA.chronicle.length} · Event cards: ${DATA.deck.length} · Fortune cards: ${DATA.fortune.length}`,
  '',
  `## Errors (${errors.length})`,
  ...(errors.length ? errors.map((e) => `- ❌ ${e}`) : ['- None. Every card, city, route, round banner and rule reference points to a fact with at least one source.']),
  '',
  `## Warnings (${warnings.length})`,
  ...(warnings.length ? warnings.map((w) => `- ⚠️ ${w}`) : ['- None.']),
  '',
  '## Plague arrival dates used on the map',
  '',
  '| City | Round | Date given in sources | Fact |',
  '|---|---|---|---|',
  ...DATA.cities.map((c) => `| ${c.name} | ${c.arrival.round === 0 ? 'Start' : DATA.timeline.rounds[c.arrival.round - 1].label} | ${c.arrival.dateText} | ${c.arrival.factIds.join(', ')} |`),
  '',
  '## Manual checks still recommended',
  '- Spot-check a sample of facts against the linked sources (each fact stores its supporting quote in `evidence`).',
  '- Card and rule wording is written in plain language; compare it with the fact text if anything seems overstated.',
];
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/audit-report.md', import.meta.url), lines.join('\n') + '\n');

console.log(`Audit: ${DATA.facts.length} facts, ${DATA.sources.length} sources, ${errors.length} errors, ${warnings.length} warnings.`);
for (const e of errors) console.log('  ERROR ' + e);
for (const w of warnings) console.log('  warn  ' + w);
console.log('Report written to docs/audit-report.md');
process.exit(errors.length ? 1 : 0);
