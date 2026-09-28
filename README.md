# Ports of Plague

*An educational board game about the Black Death, 1347–1353, played in a web browser by 2–6 players on one computer.*

Each player leads a merchant family in a real trading city. Ship goods along historical trade routes for profit, but every ship can carry the plague. The plague reaches each of the 25 cities on the map in the half-year it really did. Protect your family, keep your good name, and face the choices people faced then. The highest **Legacy** (Wealth + Family + Reputation + your weakest one again) in 1353 wins.

- **Standard** game: 12 rounds of half a year (about 41 / 55 / 69 minutes for 2 / 3 / 4 players).
- **Quick Play**: 6 rounds of a whole year (about 30–68 minutes for 2–6 players; recommended for 5–6 players).
- Three difficulties: Apprentice, Chronicler and Great Mortality.
- A dice roll at the start sets a turn order that stays the same all game. Personal **Fortune cards** (drawn on a profit roll of 6 or when opening a trading post) make every player's game different.

---

## How to play (no installation needed)

**Play online:** https://cksarge.github.io/Ports-of-Plague/

**Or offline:** download the repository and double-click `Ports-of-Plague.html`. It opens in any modern browser (Chrome, Edge, Firefox or Safari) and works completely offline, with no accounts and no internet.

- Choose 2–6 players, house names, home cities, game length and difficulty, then press **Roll for turn order**.
- Pass the computer to whoever the screen names. Everything else (dice, plague spread, scoring, rules) is handled by the game.
- Keys: **1–6** actions · **7** marriage · **8** land · **9** loan · **0** partnership · **G** close gates · **E** end turn · **R** rules · **J** Historian's Journal · **M** sound effects on/off · **N** music on/off · **Enter** confirm · **Esc** cancel.
- The game saves itself in the browser after every move. Use **Continue saved game** on the menu to pick up where you left off.

## Printable documents: folder `Printable Documents (PDF)/`

| File | What it is |
|---|---|
| `Ports-of-Plague-Rule-Book.pdf` | 4-page Rule Book with historical background (same text as the in-game Rules screen) |
| `Ports-of-Plague-Research-Sheet.pdf` | Historical Research Sheet: sources in MLA format, every fact with its source and where it appears in the game, and the historians' debates |
| `Ports-of-Plague-Presentation-Outline.pdf` | Talking points for a 5-minute class presentation |

The `docs/` folder holds the same documents as `.html` (and the outline as `.md`), plus:

| File | What it is |
|---|---|
| `simulation-report.md` | Balance testing results (game length, win rates by city and strategy, both game modes, 2–6 players) |
| `audit-report.md` | Accuracy audit: every card, city, route and rule checked against the facts database |

To print an HTML version yourself, open it in a browser and use File → Print, with US Letter paper, **Background graphics** on and **Headers and footers** off.

---

## For rebuilding and checking (needs Node.js 20 or newer)

Run once to install the single build tool (esbuild):

```
npm install
```

| Command | What it does |
|---|---|
| `npm start` | Runs the game from the source files at http://localhost:8347/dev.html (for development) |
| `npm run build` | Rebuilds the finished game: `Ports-of-Plague.html` and the identical `index.html` (the GitHub Pages front page) |
| `npm run docs` | Regenerates the Rule Book, Research Sheet and presentation outline (HTML in `docs/`, PDFs in `Printable Documents (PDF)/`; PDFs need Google Chrome installed) |
| `npm test` | Runs the automated tests of the game rules |
| `npm run simulate` | Plays thousands of computer games and writes `docs/simulation-report.md` (add a number for fewer games, e.g. `node tools/simulate.js 200`) |
| `npm run audit` | Checks every historical reference and rule number; writes `docs/audit-report.md` |
| `npm run all` | Audit, tests, build and documents in one go |
| `npm run map` | Rebuilds the map from the Natural Earth files in `tools/map-source/` (rarely needed) |

## Where everything is

```
Ports-of-Plague.html   ← the finished game (built, double-click to play)
index.html             ← an identical copy, used as the front page on GitHub Pages
dev.html               ← development page that loads the source files (use with npm start)
Printable Documents (PDF)/  ← Rule Book, Research Sheet, presentation outline
data/                  ← single source of truth for the game's content
  facts.json           85 historical facts, each with sources and a supporting quote
  sources.json         37 sources with MLA citations and links
  cities.json          25 cities: coordinates, real plague arrival dates, facts
  routes.json          40 sea and land routes
  events.json          24 dated Chronicle cards, 34 Event cards, 22 Fortune cards
  timeline.json        the 12 rounds (half-years), prologue and epilogue
  actions.json         the 11 actions and the medieval remedies
  config.json          every rule number (costs, dice, scoring); used by the game AND the rule books
  rulebook.json        the rules text, used by BOTH the in-game Rules screen and the printed Rule Book
  map.json             the generated map
src/engine/            game rules (no display code), used by tests and the simulator too
src/ui/                the interface: painted board and artwork (art.js), moving ships, dice, cards, dialogs, sound, saving
src/render/            the shared Rule Book renderer and helpers
src/styles/            screen and print styles
tests/                 automated tests (node --test)
tools/                 build, docs, simulation, audit, map and dev-server scripts
research/notes.md      raw research notes with the quotations used to verify each fact
research/facts-review.md  easy-to-read list of all facts and sources
docs/                  printable documents and reports
assets/fonts/          fonts (SIL Open Font License) with their licenses
```

**Why the printed and in-game rules always match:** both are made by the same function (`src/render/rulebook.js`) from `data/rulebook.json`, and every number in the text is filled in from `data/config.json`. That is the same file the game engine uses. The audit also checks the numbers written directly into the rules and cards.

## Publishing on GitHub Pages

The site is served straight from the `main` branch (Settings → Pages → Deploy from a branch → `main` / root). `index.html` is the built game, so after any change run `npm run build` (or `npm run all`), commit and push, and the site updates within a minute or two. The empty `.nojekyll` file tells GitHub to serve the files exactly as they are.

## Credits

- **History:** see the Research Sheet for all 37 sources (Britannica, *Nature*, *PNAS*, *Emerging Infectious Diseases*, *The Economic History Review*, university sites, and primary sources such as Boccaccio, Guy de Chauliac and Jean de Venette).
- **Map:** coastlines, rivers and lakes from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Fonts:** EB Garamond, Cinzel and UnifrakturMaguntia, all under the SIL Open Font License (see `assets/fonts/`).
- **Sound and music:** original, generated live in the browser with the Web Audio API (a lute-like melody in the medieval Dorian mode, drone and frame drum, plus sound effects); no recordings are used.

*Content note:* the game deals with mass death and with the persecution of Jewish communities. It treats both seriously and without graphic detail, and it states plainly that the accusations against Jews were false and the violence unjust.

## License

The game's code and content are released under the MIT License (see `LICENSE`). The bundled fonts keep their own SIL Open Font License (see `assets/fonts/`), and the Natural Earth map data is in the public domain.
