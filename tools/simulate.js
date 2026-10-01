// Balance simulator: plays hundreds of computer games with 2, 3 and 4
// players and reports game length, win rates by home city and by
// strategy, and whether anything dominates. Writes docs/simulation-report.md.
//   npm run simulate            (default 600 games per player count)
//   node tools/simulate.js 200  (faster)
import { writeFileSync, mkdirSync } from 'node:fs';
import { DATA, CITIES, HOME_CITIES } from '../src/data.js';
import { playBotGame } from '../src/engine/sim.js';
import { STRATEGIES } from '../src/engine/bots.js';
import { familyTotal } from '../src/engine/state.js';
import { ACTION_TYPES as TYPES } from '../src/engine/actions.js';

const GAMES = Number(process.argv[2] ?? 600);
const T = DATA.config.timing;
const ACTION_TYPES = new Set(TYPES);
const LEDGER = ['married', 'land', 'loans', 'defaults', 'deals', 'gates', 'offshore'];

// Small deterministic generator for choosing seats (separate from game dice).
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function sample(rand, list, n) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// Time model: each turn is the thinking time for its actions and decisions
// (capped by the turn timer when it is on), plus the cards shown during it,
// plus the change of player. Between turns come the round banner, the
// Chronicle pages, the Event card and the plague card (a quick message when
// nobody had to roll). The same flow as src/ui/game.js.
const PLAGUE_NEWS = ['mortality', 'upkeep', 'loanRepaid', 'loanDefault', 'dealEnd', 'gatesOpen'];
function estimateSeconds(state, n, { timer = true } = {}) {
  const log = state.log;
  let s = T.secondsSetup;
  let actions = 0, decisions = 0;
  let turn = null;
  const endTurn = () => {
    if (!turn) return;
    const think = turn.actions * T.secondsPerAction + turn.decisions * T.secondsPerDecision;
    s += (timer && state.turnSeconds !== undefined ? Math.min(think, DATA.config.turnTimer.seconds) : think) + turn.cards + T.secondsPerTurnChange;
    turn = null;
  };
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.type === 'turn') { endTurn(); turn = { actions: 0, decisions: 0, cards: 0 }; continue; }
    if (turn && ACTION_TYPES.has(e.type)) { turn.actions++; actions++; if (e.type === 'ship') turn.cards += T.secondsPerShipResult; }
    else if (turn && e.type === 'decision') { turn.decisions++; decisions++; }
    else if (e.type === 'fortune') { if (turn) turn.cards += T.secondsPerFortuneCard; }
    else if (e.type === 'round') { endTurn(); s += T.secondsPerRoundBanner; }
    else if (e.type === 'card' && e.deck === 'chronicle') {
      let k = 1;
      while (log[i + 1] && ['effect', 'card'].includes(log[i + 1].type) && (log[i + 1].type === 'effect' || log[i + 1].deck === 'chronicle')) { if (log[++i].type === 'card') k++; }
      s += Math.ceil(k / 4) * T.secondsPerChroniclePage;
    } else if (e.type === 'card') s += T.secondsPerEventCard;
    else if (e.type === 'plague') {
      endTurn();
      const group = [e];
      while (log[i + 1] && ['plague', 'mortality', 'aftermath', ...PLAGUE_NEWS].includes(log[i + 1].type)) group.push(log[++i]);
      const last = group.some((x) => x.half === DATA.config.rounds);
      s += group.some((x) => PLAGUE_NEWS.includes(x.type)) || last ? T.secondsPerPlagueCard : T.secondsPerQuietPlague;
    }
  }
  endTurn();
  return { seconds: s, actions, decisions };
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const report = [];
const summary = {};

for (const mode of ['standard', 'quick']) for (const n of [2, 3, 4, 5, 6]) {
  const key = `${mode}-${n}`;
  const rand = lcg(1000 + n + (mode === 'quick' ? 50 : 0));
  const byCity = Object.fromEntries(HOME_CITIES.map((c) => [c, { games: 0, wins: 0 }]));
  const byStrat = Object.fromEntries(STRATEGIES.map((s) => [s, { games: 0, wins: 0, score: 0, wealth: 0, family: 0, rep: 0, lost: 0 }]));
  let totalSeconds = 0, totalTurns = 0, minMin = Infinity, maxMin = 0, totalActions = 0, noTimerSeconds = 0;
  let margin = 0, comebacks = 0, comebackGames = 0, early = 0, infected = 0, protectors = 0;
  const ledger = Object.fromEntries(LEDGER.map((k) => [k, 0]));
  for (let g = 0; g < GAMES; g++) {
    const homes = sample(rand, HOME_CITIES, n);
    const strats = homes.map(() => STRATEGIES[Math.floor(rand() * STRATEGIES.length)]);
    const players = homes.map((home, i) => ({ name: `P${i + 1}`, home, strategy: strats[i] }));
    const { state, turns } = playBotGame({ players, seed: `${mode}-${n}-${g}`, mode });
    const t = estimateSeconds(state, n);
    noTimerSeconds += estimateSeconds(state, n, { timer: false }).seconds;
    totalSeconds += t.seconds; totalTurns += turns; totalActions += t.actions;
    minMin = Math.min(minMin, t.seconds / 60); maxMin = Math.max(maxMin, t.seconds / 60);
    const share = 1 / state.winner.length;
    for (const p of state.players) {
      const row = state.finalScores.find((r) => r.id === p.id);
      const won = state.winner.includes(p.id) ? share : 0;
      byCity[p.home].games++; byCity[p.home].wins += won;
      const st = byStrat[p.strategy];
      st.games++; st.wins += won; st.score += row.total; st.wealth += row.wealth; st.family += row.family; st.rep += row.reputation;
      st.lost += p.lostFamily;
      for (const k of LEDGER) ledger[k] += p.stats[k];
    }
    const sorted = [...state.finalScores];
    margin += sorted[0].total - sorted[1].total;
    early += state.log.filter((e) => e.type === 'arrival' && e.early).length;
    infected += state.log.filter((e) => e.type === 'ship' && e.infected).length;
    protectors += state.log.filter((e) => e.type === 'decision' && e.kind === 'protect' && e.choice === true).length;
    // Comeback: the house in last place at the halfway point (ignoring the
    // random strategy, which rarely wins anything) went on to win.
    const mid = state.players[state.midLast];
    if (mid && mid.strategy !== 'random') { comebackGames++; if (state.winner.includes(mid.id)) comebacks++; }
  }
  const avgMin = totalSeconds / GAMES / 60;
  const noTimerMin = noTimerSeconds / GAMES / 60;
  const fair = 1 / n;
  const cityRows = HOME_CITIES.map((c) => ({ c, rate: byCity[c].wins / Math.max(1, byCity[c].games), games: byCity[c].games }));
  const stratRows = STRATEGIES.map((s) => ({ s, ...byStrat[s], rate: byStrat[s].wins / Math.max(1, byStrat[s].games) }));
  const worstCity = cityRows.reduce((a, b) => (Math.abs(b.rate - fair) > Math.abs(a.rate - fair) ? b : a));
  const topStrat = stratRows.filter((r) => r.s !== 'random').reduce((a, b) => (b.rate > a.rate ? b : a));
  summary[key] = { noTimerMin, ledger, mode, n, comeback: comebacks / Math.max(1, comebackGames), avgMin, minMin, maxMin, cityRows, stratRows, fair, worstCity, topStrat };

  report.push(`## ${DATA.config.modes[mode].label}: ${n} players (${GAMES} games)`, '');
  report.push(`- Turns per game: **${totalTurns / GAMES}** (${DATA.config.prePlague.rounds[mode]} pre-plague + ${DATA.config.rounds / DATA.config.modes[mode].span} rounds × ${n} players)`);
  report.push(`- Actions per game: ${(totalActions / GAMES).toFixed(0)}`);
  report.push(`- Estimated length with the turn timer: **${avgMin.toFixed(0)} minutes** on average (range ${minMin.toFixed(0)}–${maxMin.toFixed(0)}); without it: ${noTimerMin.toFixed(0)} minutes`);
  report.push(`- Average winning margin: ${(margin / GAMES).toFixed(1)} Legacy points`);
  report.push(`- Infected shipments per game: ${(infected / GAMES).toFixed(1)}; cities struck early by trade: ${(early / GAMES).toFixed(1)}`);
  report.push(`- Times a house protected the persecuted community: ${(protectors / GAMES).toFixed(2)} per game`);
  report.push(`- Merchant's Ledger per game: ${LEDGER.map((k) => `${k} ${(ledger[k] / GAMES).toFixed(2)}`).join(', ')}`);
  report.push(`- Comebacks: the house in last place at the halfway point went on to win ${pct(comebacks / Math.max(1, comebackGames))} of games`, '');
  report.push('| Home city | Seats | Win rate | Fair share |', '|---|---|---|---|');
  for (const r of cityRows) report.push(`| ${CITIES[r.c].name} | ${r.games} | ${pct(r.rate)} | ${pct(fair)} |`);
  report.push('', '| Strategy | Seats | Win rate | Avg Legacy | Wealth | Family | Reputation | Family lost |', '|---|---|---|---|---|---|---|---|');
  for (const r of stratRows) {
    const g = Math.max(1, r.games);
    report.push(`| ${r.s} | ${r.games} | ${pct(r.rate)} | ${(r.score / g).toFixed(1)} | ${(r.wealth / g).toFixed(1)} | ${(r.family / g).toFixed(1)} | ${(r.rep / g).toFixed(1)} | ${(r.lost / g).toFixed(2)} |`);
  }
  report.push('');
}

// Head-to-head: every 4-player game seats one of each deliberate strategy,
// rotating through all home-city combinations, so no strategy is helped by luck of the draw.
const h2hAll = {};
const H2H_GAMES = GAMES;
for (const mode of ['standard', 'quick']) {
  const h2h = (h2hAll[mode] = Object.fromEntries(['greedy', 'cautious', 'charitable', 'balanced'].map((k) => [k, { wins: 0, score: 0 }])));
  const rand = lcg(4242);
  const lineup = ['greedy', 'cautious', 'charitable', 'balanced'];
  for (let g = 0; g < H2H_GAMES; g++) {
    const homes = sample(rand, HOME_CITIES, 4);
    const players = homes.map((home, i) => ({ name: lineup[(i + g) % 4], home, strategy: lineup[(i + g) % 4] }));
    const { state } = playBotGame({ players, seed: `h2h-${mode}-${g}`, mode });
    for (const p of state.players) {
      if (state.winner.includes(p.id)) h2h[p.strategy].wins += 1 / state.winner.length;
      h2h[p.strategy].score += state.finalScores.find((r) => r.id === p.id).total;
    }
  }
}

const header = [
  '# Ports of Plague — Balance Simulation',
  '',
  `Generated by \`npm run simulate\` on ${new Date().toISOString().slice(0, 10)}. Each game uses randomly chosen home cities and randomly assigned computer strategies.`,
  '',
  '**Strategies.** *Greedy*: always ships for the most money, never gives or flees. *Cautious*: moves family away from danger first, avoids risky cargo. *Charitable*: gives to charity every turn and accepts offers. *Balanced*: works on its weakest score category. *Random*: picks any legal move (a stand-in for a confused beginner).',
  '',
  `**Time model (players at a decent pace).** ${T.secondsPerAction} s to choose each action and ${T.secondsPerDecision} s per decision (together capped at ${DATA.config.turnTimer.seconds} s per turn by the turn timer), ${T.secondsPerShipResult} s per shipment result (clean shipments close by themselves), ${T.secondsPerFortuneCard} s per Fortune card, ${T.secondsPerTurnChange} s to change player, ${T.secondsPerRoundBanner} s per round banner, ${T.secondsPerChroniclePage} s per Chronicle page (up to 4 cards), ${T.secondsPerEventCard} s per Event card, ${T.secondsPerPlagueCard} s per plague card (${T.secondsPerQuietPlague} s when nobody rolls) and ${T.secondsSetup} s for the turn-order roll. Pre-plague rounds on. First games and reading every card aloud will run longer.`,
  '',
  '## Head-to-head (one of each strategy in every 4-player game)',
  '',
  '| Strategy | Standard win rate | Quick Play win rate | Avg Legacy (Standard) |',
  '|---|---|---|---|',
  ...Object.keys(h2hAll.standard).map((k) => `| ${k} | ${pct(h2hAll.standard[k].wins / H2H_GAMES)} | ${pct(h2hAll.quick[k].wins / H2H_GAMES)} | ${(h2hAll.standard[k].score / H2H_GAMES).toFixed(1)} |`),
  '',
  '## Summary',
  '',
  '| Mode | Players | Avg minutes (timer) | Without timer | Home city furthest from fair share | Best non-random strategy |',
  '|---|---|---|---|---|---|',
  ...Object.values(summary).map((s) => `| ${DATA.config.modes[s.mode].label} | ${s.n} | ${s.avgMin.toFixed(0)} | ${s.noTimerMin.toFixed(0)} | ${CITIES[s.worstCity.c].name} ${pct(s.worstCity.rate)} (fair ${pct(s.fair)}) | ${s.topStrat.s} ${pct(s.topStrat.rate)} |`),
  '',
];
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/simulation-report.md', import.meta.url), [...header, ...report].join('\n') + '\n');

for (const s of Object.values(summary)) {
  const n = s.n;
  console.log(`\n${s.mode} ${n} players: ~${s.avgMin.toFixed(1)} min, ${s.noTimerMin.toFixed(0)} without timer (range ${s.minMin.toFixed(0)}-${s.maxMin.toFixed(0)}), fair share ${pct(s.fair)}, comebacks ${pct(s.comeback)}`);
  console.log('  cities:     ' + s.cityRows.map((r) => `${r.c} ${pct(r.rate)}`).join(', '));
  console.log('  ledger/game: ' + LEDGER.map((k) => `${k} ${(s.ledger[k] / GAMES).toFixed(2)}`).join(', '));
  console.log('  strategies: ' + s.stratRows.map((r) => `${r.s} ${pct(r.rate)} (L${(r.score / r.games).toFixed(0)} W${(r.wealth / r.games).toFixed(0)} F${(r.family / r.games).toFixed(0)} R${(r.rep / r.games).toFixed(0)})`).join(', '));
}
for (const m of ['standard', 'quick']) console.log(`\nHead-to-head ${m}: ` + Object.entries(h2hAll[m]).map(([k, v]) => `${k} ${pct(v.wins / H2H_GAMES)}`).join(', '));
console.log('\nReport written to docs/simulation-report.md');
