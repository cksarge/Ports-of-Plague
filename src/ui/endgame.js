// End of game: final Legacy scores and "What Really Happened".
import { DATA, CITIES } from '../data.js';
import { familyTotal, C } from '../engine/state.js';
import { esc, crestSvg, $ } from './dom.js';
import { noteHtml } from './notes.js';
import { showJournal } from './panels.js';
import { sfx } from './sound.js';

export function renderEnd(app, state, { onAgain, onMenu }) {
  const rows = state.finalScores;
  const names = state.winner.map((id) => esc(state.players[id].name)).join(' and ');
  const early = state.log.filter((e) => e.type === 'arrival' && e.early);
  const totalStart = state.players.length * C.start.family;
  const lost = state.players.reduce((a, p) => a + p.lostFamily, 0);
  const infected = state.log.filter((e) => e.type === 'ship' && e.infected).length;
  const protectedBy = state.players.filter((p) => p.stats.protected > 0).map((p) => esc(p.name));
  sfx.victory();
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  app.innerHTML = `<section class="screen"><div class="frame" style="max-width:1100px;width:100%">
    <h1 class="title" style="font-size:3rem">Anno Domini 1353</h1>
    <p class="subtitle">${names} ${state.winner.length > 1 ? 'share the victory' : 'wins'} with the greatest Legacy.</p>
    <div class="podium">${rows.map((r) => {
      const p = state.players[r.id];
      return `<div class="podium-row ${r.place === 1 ? 'first' : ''}" style="--house:${p.color}">
        <span class="place">${r.place}</span>${crestSvg(p, 30)}
        <span><strong>${esc(p.name)}</strong> of ${esc(CITIES[p.home].name)}<br><span class="breakdown">Wealth ${r.wealth} (${p.florins}ƒ, ${p.posts.length} posts) + Family ${r.family} (${familyTotal(p)} alive) + Reputation ${r.reputation} (${p.reputation}) + Balance ${r.balance}</span>
        <br><span class="breakdown">${p.stats.shipments} shipments (${p.stats.infected} infected) · ${p.lostFamily} family lost · ${p.stats.fled} time${p.stats.fled === 1 ? '' : 's'} fled · ${p.stats.charity} charity · ${p.stats.fortune ?? 0} Fortune cards · ${p.stats.protected ? 'protected the persecuted community' : 'did not protect the persecuted community'}</span></span>
        <span class="total">${r.total}</span></div>`;
    }).join('')}</div>
    <div class="end-grid">
      <section class="panel"><h2>Your game</h2><ul>
        <li>Your houses lost <strong>${lost}</strong> of ${totalStart} family members (${Math.round((100 * lost) / totalStart)}%). Historians estimate that between a third and 60 percent of Europeans died.</li>
        <li>Your ships carried infected cargo <strong>${infected}</strong> time${infected === 1 ? '' : 's'}, bringing the plague early to ${early.length ? early.map((e) => esc(CITIES[e.city].name)).join(', ') : 'no city'}. In real history, trade routes carried the plague across Europe.</li>
        <li>${protectedBy.length ? `${protectedBy.join(', ')} took a stand to protect a persecuted community.` : 'No house took a stand to protect the persecuted community.'} In 1349, the people who tried were overruled; the accusations were false and the violence unjust.</li>
      </ul></section>
      <section class="panel"><h2>What Really Happened</h2>${noteHtml(DATA.timeline.epilogue.factIds, 'The real history')}</section>
    </div>
    <div class="dialog-actions">
      <button class="btn" id="journal">Historian's Journal (${state.journal.length} facts)</button>
      <button class="btn" id="menu">Main menu</button>
      <button class="btn primary" id="again">Play again</button>
    </div>
  </div></section>`;
  $('#journal', app).onclick = () => showJournal(state.journal);
  $('#menu', app).onclick = onMenu;
  $('#again', app).onclick = onAgain;
  $('#again', app).focus();
}
