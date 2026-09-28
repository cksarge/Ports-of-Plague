// Shared dialogs: Rules, Historian's Journal, city information, credits.
import { DATA, CITIES, FACTS } from '../data.js';
import { renderRulebook } from '../render/rulebook.js';
import { routesFrom, otherEnd, familyAt, isThreatened } from '../engine/state.js';
import { severityName } from '../engine/plague.js';
import { openDialog, esc, crestSvg } from './dom.js';
import { factHtml, journalHtml, noteHtml } from './notes.js';

export function showRules() {
  const body = renderRulebook(DATA.rulebook, DATA.config, {
    factRef: (id) => `<sup class="fact-ref" title="${esc(FACTS[id]?.text ?? id)}">[${id}]</sup>`,
  });
  return openDialog(`<div class="frame rules">
      <h1 class="title" style="font-size:2.6rem">${esc(DATA.rulebook.title)}</h1>
      <p class="subtitle">${esc(DATA.rulebook.subtitle)} — Rule Book</p>
      <p class="rules-note">These are the same rules as the printable Rule Book (both are generated from one file). Numbers in brackets like [TR-02] are historical facts; hover to read them, or open the Historian's Journal.</p>
      ${body}
      <div class="dialog-actions"><button class="btn primary" data-value="close" autofocus>Close rules <span class="key">Esc</span></button></div>
    </div>`, { wide: true, label: 'Rule Book' });
}

export function showJournal(journal) {
  return openDialog(`<div class="frame">
      <h2>The Historian's Journal</h2>
      <p class="drop-cap">Every historical fact you meet during play is recorded here with its source. Facts marked “Historians disagree” are still debated.</p>
      ${journalHtml(journal)}
      <div class="dialog-actions"><button class="btn primary" data-value="close" autofocus>Close journal</button></div>
    </div>`, { wide: true, label: "Historian's Journal" });
}

export function showCity(state, cityId) {
  const c = CITIES[cityId];
  const cs = state.cities[cityId];
  const status = cs.state === 'stricken'
    ? `<strong class="risk">Stricken</strong>, severity ${cs.severity} (${severityName(cs.severity)})${cs.early ? ', brought early by infected cargo' : ''}`
    : cs.state === 'aftermath' ? '<strong>Aftermath</strong>: workers scarce, prices high (shipping here earns a bonus; shipping from here costs a wage)'
      : isThreatened(state, cityId) ? '<strong style="color:var(--warn)">Safe, but threatened</strong>: a neighbouring city is Stricken' : '<strong>Safe</strong>';
  const houses = state.players.filter((p) => p.posts.includes(cityId));
  const routes = routesFrom(cityId).map((r) => `<li>${r.type === 'sea' ? '⚓ Sea' : '🛤 Land'} route to ${esc(CITIES[otherEnd(r, cityId)].name)} (value ${r.value})</li>`).join('');
  return openDialog(`<div class="frame">
      <h2>${esc(c.name)}</h2>
      <p><em>${esc(c.modern)} · ${esc(c.region)}</em></p>
      <p>Status: ${status}${cs.unrest ? ` · <strong>Unrest</strong> (${cs.unrest} more round${cs.unrest > 1 ? 's' : ''})` : ''}</p>
      <p>When the plague really arrived: <strong>${esc(c.arrival.dateText)}</strong>${c.arrival.round === 0 ? '' : ` (round: ${esc(DATA.timeline.rounds[c.arrival.round - 1].label)})`}</p>
      ${houses.length ? `<p>Trading posts: ${houses.map((p) => `${crestSvg(p, 16)} ${esc(p.name)}${familyAt(p, cityId) ? ` (${familyAt(p, cityId)} family)` : ''}`).join(' · ')}</p>` : '<p>No house has a trading post here yet.</p>'}
      <h3>Routes</h3><ul>${routes}</ul>
      ${noteHtml([...c.arrival.factIds, ...c.factIds], `History of ${c.name}`)}
      <div class="dialog-actions"><button class="btn primary" data-value="close" autofocus>Close</button></div>
    </div>`, { label: c.name });
}

export function showFacts(title, factIds) {
  return openDialog(`<div class="frame"><h2>${esc(title)}</h2>${factIds.map((id) => factHtml(id)).join('')}
    <div class="dialog-actions"><button class="btn primary" data-value="close" autofocus>Close</button></div></div>`, { wide: true, label: title });
}

export function showCredits() {
  return openDialog(`<div class="frame">
    <h2>About Ports of Plague</h2>
    <p>An original educational game about the spread and effects of the Black Death, 1347–1353, made for a high-school history class.</p>
    <ul>
      <li><strong>History:</strong> ${DATA.facts.length} facts from ${DATA.sources.length} sources (see the Historian's Journal and the Research Sheet).</li>
      <li><strong>Map:</strong> coastlines, rivers and lakes from Natural Earth (public domain).</li>
      <li><strong>Fonts:</strong> EB Garamond, Cinzel and UnifrakturMaguntia, all under the SIL Open Font License.</li>
      <li><strong>Sound and music:</strong> original, generated live in your browser; no recordings are used.</li>
      <li><strong>Playing on several devices:</strong> the big screen and the players' phones, tablets or computers talk through Supabase Realtime (supabase.com), using the open-source libraries <em>@supabase/realtime-js</em> (© 2020 Supabase) and <em>@supabase/phoenix</em> (© 2014 Chris McCord), both under the MIT License. Only house names, home cities and game moves are sent; nothing is stored and there are no accounts.</li>
    </ul>
    <p>Content note: the game deals with mass death and with the persecution of Jewish communities. It treats these seriously and without graphic detail, and it states plainly that the accusations against Jews were false and the violence unjust.</p>
    <div class="dialog-actions"><button class="btn primary" data-value="close" autofocus>Close</button></div></div>`, { label: 'About' });
}
