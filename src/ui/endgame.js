// End of game: the animated finale (finale.js), then the final Legacy scores
// and "What Really Happened".
import { DATA, CITIES } from '../data.js';
import { familyTotal, C } from '../engine/state.js';
import { esc, crestSvg, $ } from './dom.js';
import { noteHtml } from './notes.js';
import { showJournal } from './panels.js';
import { zoomToFit, pageFits } from './fit.js';
import { playFinale, summary, PARTS } from './finale.js';

// fit: the big screen of a multi-device game, where the results must fit without scrolling.
export function renderEnd(app, state, opts) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  playFinale(app, state, { onDone: () => renderResults(app, state, opts) });
}

function renderResults(app, state, opts) {
  const { onAgain, onMenu, fit = false } = opts;
  const rows = state.finalScores;
  const sum = summary(state);
  const max = Math.max(1, ...rows.map((r) => r.total));
  app.innerHTML = `<section class="screen results"><div class="frame" style="max-width:1100px;width:100%">
    <h1 class="title" style="font-size:3rem">Anno Domini 1353</h1>
    <p class="subtitle">${sum.winLine}</p>
    <div class="podium">${rows.map((r, i) => {
      const p = state.players[r.id];
      return `<div class="podium-row ${r.place === 1 ? 'first' : ''}" style="--house:${p.color};--i:${i}">
        <span class="place">${r.place}</span>${crestSvg(p, 30)}
        <span><strong>${esc(p.name)}</strong>${p.bot ? ` <small class="bot-tag">Bot · ${esc(C.bots.skills[p.skill]?.label ?? '')}</small>` : ''} of ${esc(CITIES[p.home].name)}<br><span class="breakdown">Wealth ${r.wealth} (${p.florins}ƒ, ${p.posts.length} posts) + Family ${r.family} (${familyTotal(p)} alive) + Reputation ${r.reputation} (${p.reputation}) + Balance ${r.balance}</span>
        <span class="mini-bar" aria-hidden="true">${PARTS.map(([k]) => `<i class="k-${k}" style="--w:${((100 * r[k]) / max).toFixed(2)}%"></i>`).join('')}</span>
        <span class="breakdown">${p.stats.shipments} shipments (${p.stats.infected} infected) · ${p.lostFamily} family lost · ${p.stats.fled} time${p.stats.fled === 1 ? '' : 's'} fled · ${p.stats.charity} charity · ${p.stats.fortune ?? 0} Fortune cards · ${p.stats.protected ? 'protected the persecuted community' : 'did not protect the persecuted community'}</span></span>
        <span class="total">${r.total}</span></div>`;
    }).join('')}</div>
    <div class="end-grid">
      <section class="panel"><h2>Your game</h2><ul class="end-cards">
        <li>${sum.lostLine}</li>
        <li>${sum.shipLine}</li>
        <li>${sum.standLine}</li>
      </ul></section>
      <section class="panel"><h2>What Really Happened</h2>${noteHtml(DATA.timeline.epilogue.factIds, 'The real history')}</section>
    </div>
    <div class="dialog-actions">
      <button class="btn" id="replay">↺ Watch the finale again</button>
      <button class="btn" id="journal">Historian's Journal (${state.journal.length} facts)</button>
      <button class="btn" id="menu">Main menu</button>
      <button class="btn primary" id="again">Play again</button>
    </div>
  </div></section>`;
  $('#replay', app).onclick = () => renderEnd(app, state, opts);
  $('#journal', app).onclick = () => showJournal(state.journal);
  $('#menu', app).onclick = onMenu;
  $('#again', app).onclick = onAgain;
  $('#again', app).focus({ preventScroll: true });
  window.scrollTo(0, 0);
  if (fit) {
    $('.frame', app).classList.add('end-fit');
    zoomToFit($('.frame', app), pageFits, 0.4, { widen: true });
  }
}
