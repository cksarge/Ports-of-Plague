// Plague spread, severity, survival and aftermath.
import { DATA, CITIES } from '../data.js';
import { C, addLog, familyTotal, familyLocations, isStricken, difficultyOf } from './state.js';
import { roll } from './rng.js';

export function severityRoll(state, cityId) {
  const die = roll(state, 6);
  const diff = difficultyOf(state);
  const base = C.plague.severityTable[String(die)];
  const severity = Math.max(1, Math.min(C.plague.severityMax, base + (CITIES[cityId].severityMod ?? 0) + diff.severityMod));
  return { die, severity };
}

export function severityName(n) {
  return C.plague.severityNames[String(n)] ?? '';
}

// Make a city Stricken. `early` = brought one round ahead of history by an infected shipment.
export function strikeCity(state, cityId, { early = false, by = null } = {}) {
  const c = state.cities[cityId];
  if (c.state !== 'safe') return null;
  const { die, severity } = severityRoll(state, cityId);
  Object.assign(c, { state: 'stricken', severity, strickenFor: 0, early });
  const city = CITIES[cityId];
  const text = early
    ? `Infected cargo brings the plague to ${city.name} one round early. (Historically: ${city.arrival.dateText}.)`
    : `The plague reaches ${city.name}. (Historically: ${city.arrival.dateText}.)`;
  return addLog(state, {
    type: 'arrival', city: cityId, die, severity, early, by,
    text: `${text} Severity: ${severityName(severity)}.`,
    factIds: city.arrival.factIds,
  });
}

// Chronicle phase: every city whose historical arrival falls in this round.
export function historicalArrivals(state, half = state.round) {
  const out = [];
  for (const city of DATA.cities) {
    if (city.arrival.round === half) {
      const e = strikeCity(state, city.id);
      if (e) out.push(e);
      else addLog(state, { type: 'arrivalAlready', city: city.id, text: `${city.name} was already Stricken, earlier than in real history (${city.arrival.dateText}).`, factIds: city.arrival.factIds });
    }
  }
  return out;
}

// Plague phase: every family member in a Stricken city rolls for survival.
export function mortalityPhase(state) {
  const results = [];
  for (const p of state.players) {
    for (const loc of familyLocations(p)) {
      if (!isStricken(state, loc)) continue;
      const sev = state.cities[loc].severity;
      const prepared = p.prepared.includes(loc);
      let physicianAvailable = p.physician.includes(loc);
      const rolls = [];
      let deaths = 0;
      let saved = 0;
      const members = p.family[loc];
      for (let i = 0; i < members; i++) {
        const die = roll(state, 6);
        const total = die + (prepared ? C.plague.prepareBonus : 0);
        let dies = total <= sev;
        let save = null;
        if (dies && physicianAvailable) {
          physicianAvailable = false;
          save = roll(state, 6);
          if (save >= C.plague.physicianSaveOn) { dies = false; saved++; }
        }
        // The last heir never dies: a distant cousin inherits.
        if (dies && familyTotal(p) - deaths <= 1) {
          rolls.push({ die, total, dies: false, save, lastHeir: true });
          continue;
        }
        if (dies) deaths++;
        rolls.push({ die, total, dies, save });
      }
      p.family[loc] -= deaths;
      p.lostFamily += deaths;
      p.florins += deaths * C.gains.inheritance;
      const lastHeir = rolls.some((r) => r.lastHeir);
      const cityName = CITIES[loc].name;
      let text = `${p.name}: ${members} family member${members === 1 ? '' : 's'} in ${cityName} (${severityName(sev)}${prepared ? ', prepared' : ''}). `;
      text += deaths ? `${deaths} died. The house inherits ${deaths * C.gains.inheritance}ƒ.` : 'All survived.';
      if (saved) text += ' Nursing care saved one.';
      if (lastHeir) text += ' The last heir survives: a distant cousin would inherit.';
      results.push(addLog(state, {
        type: 'mortality', player: p.id, city: loc, severity: sev, prepared, rolls, deaths, saved, lastHeir, text,
        factIds: deaths ? ['EC-10'] : [],
      }));
    }
  }
  return results;
}

// End of the plague phase: Stricken cities age; after enough rounds they enter Aftermath.
export function advanceCities(state) {
  for (const [id, c] of Object.entries(state.cities)) {
    if (c.unrest > 0) c.unrest--;
    if (c.state !== 'stricken') continue;
    c.strickenFor++;
    if (c.strickenFor >= C.plague.strickenRounds) {
      c.state = 'aftermath';
      addLog(state, {
        type: 'aftermath', city: id,
        text: `The plague passes from ${CITIES[id].name}. The city enters Aftermath: workers are scarce and prices high.`,
        factIds: ['EC-02', 'EC-03'],
      });
    }
  }
}
