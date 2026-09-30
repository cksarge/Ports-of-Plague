// Loads every data file once. Used by the game engine, the interface,
// the tests, the simulator and the document builders, so all of them
// read exactly the same numbers and facts.
import config from '../data/config.json' with { type: 'json' };
import facts from '../data/facts.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import cities from '../data/cities.json' with { type: 'json' };
import routes from '../data/routes.json' with { type: 'json' };
import timeline from '../data/timeline.json' with { type: 'json' };
import events from '../data/events.json' with { type: 'json' };
import rulebook from '../data/rulebook.json' with { type: 'json' };
import actions from '../data/actions.json' with { type: 'json' };
import music from '../data/music.json' with { type: 'json' };

export const DATA = {
  config,
  facts: facts.facts,
  categories: facts.categories,
  sources: sources.sources,
  accessed: sources.accessed,
  cities: cities.cities,
  routes: routes.routes,
  timeline,
  chronicle: events.chronicle,
  deck: events.deck,
  fortune: events.fortune,
  rulebook,
  actions: actions.actions,
  remedies: actions.remedies,
  music: music.tracks,
};

export const FACTS = Object.fromEntries(DATA.facts.map((f) => [f.id, f]));
export const SOURCES = Object.fromEntries(DATA.sources.map((s) => [s.id, s]));
export const CITIES = Object.fromEntries(DATA.cities.map((c) => [c.id, c]));
export const HOME_CITIES = DATA.cities.filter((c) => c.home).map((c) => c.id);
