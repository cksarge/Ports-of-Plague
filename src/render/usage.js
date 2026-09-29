// Works out where each fact appears in the game (cards, cities, routes,
// timeline, rules). Used by the accuracy audit and the Research Sheet.
import { placeholders } from './template.js';

export function factUsage(DATA) {
  const usage = {};
  const add = (id, where) => {
    (usage[id] ||= []).push(where);
  };
  for (const c of DATA.cities) {
    for (const id of c.factIds) add(id, `City: ${c.name}`);
    for (const id of c.arrival.factIds) add(id, `Plague arrival: ${c.name}`);
  }
  for (const r of DATA.routes) {
    for (const id of r.factIds) add(id, `Route: ${routeName(DATA, r)}`);
  }
  for (const card of DATA.chronicle) {
    for (const id of card.factIds) add(id, `Chronicle card: ${card.title}`);
  }
  for (const card of DATA.deck) {
    for (const id of card.factIds) add(id, `Event card: ${card.title}`);
  }
  for (const card of DATA.fortune ?? []) {
    for (const id of card.factIds) add(id, `Fortune card: ${card.title}`);
  }
  for (const r of [...DATA.timeline.prePlague, ...DATA.timeline.rounds]) {
    for (const id of r.factIds) add(id, `Round banner: ${r.label}`);
  }
  for (const id of DATA.timeline.prologue.factIds) add(id, 'Prologue');
  for (const id of DATA.timeline.epilogue.factIds) add(id, 'End-of-game summary');
  for (const a of DATA.actions) for (const id of a.factIds) add(id, `Action: ${a.name}`);
  for (const r of DATA.remedies) for (const id of r.factIds) add(id, `Physician remedy: ${r.name}`);
  for (const sec of DATA.rulebook.sections) {
    for (const text of sectionTexts(sec)) {
      for (const p of placeholders(text)) {
        if (p.startsWith('fact:')) add(p.slice(5), `Rule Book: ${sec.title}`);
      }
    }
  }
  for (const id of Object.keys(usage)) usage[id] = [...new Set(usage[id])];
  return usage;
}

export function routeName(DATA, r) {
  const n = (id) => DATA.cities.find((c) => c.id === id)?.name ?? id;
  return `${n(r.a)}–${n(r.b)}`;
}

export function sectionTexts(sec) {
  const out = [];
  for (const b of sec.blocks) {
    if (b.text) out.push(b.text);
    if (b.items) for (const i of b.items) out.push(...(Array.isArray(i) ? i : [i]));
    if (b.head) out.push(...b.head);
    if (b.rows) for (const row of b.rows) out.push(...row);
  }
  return out;
}
