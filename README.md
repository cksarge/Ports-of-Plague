# Ports of Plague

*An educational board game about the Black Death, 1347–1353, played in a web browser by 1–6 players (computer "bots" can play any house), sharing one computer or each on their own phone, tablet or computer.*

Each player leads a merchant family in a real trading city. Ship goods along historical trade routes for profit, but every ship can carry the plague. The plague reaches each of the 45 cities on the map, from Lisbon, Dublin and Oslo to Cairo, Aleppo, Trebizond and Pskov, in the half-year it really did. Protect your family, keep your good name, and face the choices people faced then. The highest **Legacy** (Wealth + Family + Reputation + your weakest one again) in 1353 wins. The map zooms with the mouse wheel, a trackpad pinch, two fingers on a touch screen or the **+ / −** buttons, and you drag to move around it.

- **Standard** game: 12 rounds of half a year (about 28 / 36 / 44 minutes for 2 / 3 / 4 players).
- **Quick Play**: 4 rounds of a year and a half (about 13 / 17 / 20 minutes for 2 / 3 / 4 players at a steady pace; recommended for 5–6 players).
- **Pre-plague rounds** (on by default): 2 extra rounds in the standard game, 1 in Quick Play, set in 1346–47 before the plague sails west. No Event card, no plague, and trading posts cost 3ƒ less, so houses can set up their trade first.
- **Turn timer** (on by default): 30 seconds per turn, paused while cards and dice are on screen. When it runs out, waiting cards are declined and the next house plays.
- Three difficulties: Apprentice, Chronicler and Great Mortality.
- Each turn you have 2 action points (3 in Quick Play). Most actions take 1; opening a trading post or moving family takes 2.
- A dice roll at the start sets a turn order that stays the same all game. Personal **Fortune cards** (drawn on a profit roll of 6 or when opening a trading post) make every player's game different.

---

## How to play (no installation needed)

**Play online:** https://portsofplague.carterscoding.com/

**Or offline:** download the repository and double-click `Ports-of-Plague.html`. It opens in any modern browser (Chrome, Edge, Firefox or Safari) and works completely offline, with no accounts and no internet.

- Choose 2–6 houses, house names, home cities, game length and difficulty, then press **Roll for turn order**.
- **Bots:** set any house to *Played by: A bot* and pick **Easy**, **Medium** or **Hard**. Bots take their turns on screen, one move at a time. With one person and the rest bots, you can play alone (no pass-the-device screens).
- Pass the computer to whoever the screen names. Everything else (dice, plague spread, scoring, rules) is handled by the game.
- Keys: **1–6** actions · **7** marriage · **8** land · **9** loan · **0** partnership · **G** close gates · **E** end turn · **R** rules · **J** Historian's Journal · **M** sound effects on/off · **N** music on/off · **Enter** confirm · **Esc** cancel.
- The game saves itself in the browser after every move. Use **Continue saved game** on the menu to pick up where you left off.

### Playing on several devices (Jackbox style)

1. On the big screen (a laptop or a projector), choose **New game → Play on: Everyone on their own device**. A **room code** of 4 letters and numbers appears (like `B7KX`).
2. Each player opens https://portsofplague.carterscoding.com/ on their own phone, tablet or computer, chooses **Join a game**, types the code, and picks a house name and home city.
3. To fill empty seats, press **Add a bot** in the lobby and choose its skill. Bots play on the big screen.
4. When everyone is in, press **Roll for turn order** on the big screen.

The big screen shows the map, the dice and every card, sized so nothing ever needs scrolling. On your turn your own device shows your house, the actions and your decision cards; while another house takes its turn, it shows the map under **Please wait**; on the story cards, **anyone** can press **Next**. Any time, each device can also open the **Rules**, the **Historian's Journal**, the **Chronicle** (recent events and the latest historical note), the **Map** (tap a city for its history) and **the card on the big screen** ("Read the card here"), so nobody has to walk up to the big screen. On a computer the keys are **R**, **J**, **C**, **M** and **Enter** for Next. A device that reloads or goes to sleep rejoins by itself. A player on a new device can take their place back by joining with the same code and typing their house name. A player who has to go can press **Leave game** on their device: their house stays on the board but sits out (its turns are skipped and card offers are turned down), and they can come back by joining with the same code. If the big screen leaves (**Save & menu**, closing its tab, or losing its connection for a minute), every device shows a message and goes back to the menu. **Continue saved game** reopens the same code, and players join again with it to get their houses back. During a game, closing the tab of a player's device or of the big screen first asks "Leave site?" (on computers and some Android phones; iPhones and iPads never show it).

Multi-device play needs an internet connection (the finished file still works offline for one-device play). It uses Supabase to pass messages between the devices; see *Supabase setup* below.

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

Run once to install the build tool (esbuild) and the Supabase realtime client used for multi-device play:

```
npm install
```

| Command | What it does |
|---|---|
| `npm start` | Runs the game from the source files at http://localhost:8347/dev.html (for development). Add `?net=local` to test multi-device play with several tabs of one browser, without internet or Supabase |
| `npm run build` | Rebuilds the finished game: `Ports-of-Plague.html` and the identical `index.html` (the GitHub Pages front page) |
| `npm run docs` | Regenerates the Rule Book, Research Sheet and presentation outline (HTML in `docs/`, PDFs in `Printable Documents (PDF)/`; PDFs need Google Chrome installed) |
| `npm test` | Runs the automated tests of the game rules |
| `npm run simulate` | Plays thousands of computer games and writes `docs/simulation-report.md` (add a number for fewer games, e.g. `node tools/simulate.js 200`) |
| `npm run audit` | Checks every historical reference and rule number; writes `docs/audit-report.md` |
| `npm run all` | Audit, tests, build and documents in one go |
| `npm run map` | Rebuilds the map from the Natural Earth files in `tools/map-source/` (rarely needed) |
| `npm run music` | Makes the small phone copies of the music in `assets/music/mobile/` (run after changing a song; macOS only, uses `afconvert`) |

## Where everything is

```
Ports-of-Plague.html   ← the finished game (built, double-click to play)
index.html             ← an identical copy, used as the front page on GitHub Pages
dev.html               ← development page that loads the source files (use with npm start)
Printable Documents (PDF)/  ← Rule Book, Research Sheet, presentation outline
data/                  ← single source of truth for the game's content
  facts.json           85 historical facts, each with sources and a supporting quote
  sources.json         37 sources with MLA citations and links
  cities.json          45 cities: coordinates, real plague arrival dates, facts
  routes.json          40 sea and land routes
  events.json          24 dated Chronicle cards, 34 Event cards, 22 Fortune cards
  timeline.json        the 12 rounds (half-years), 2 pre-plague half-years, prologue and epilogue
  actions.json         the 11 actions and the medieval remedies
  config.json          every rule number (costs, dice, scoring); used by the game AND the rule books
  rulebook.json        the rules text, used by BOTH the in-game Rules screen and the printed Rule Book
  map.json             the generated map
src/engine/            game rules (no display code), used by tests and the simulator too
src/ui/                the interface: painted board and artwork (art.js), moving ships, dice, cards, dialogs, sound, saving;
                       prompts.js (action and decision choices) and stories.js (story cards), shared by the big screen and the players' devices;
                       controller.js (a player's own device); fit.js (fits the big screen without scrolling)
src/net/               multi-device play: room codes, messages and checks (protocol.js), big screen (host.js), player's device (client.js), Supabase connection (transport.js, config.js)
src/render/            the shared Rule Book renderer and helpers
src/styles/            screen and print styles
tests/                 automated tests (node --test)
tools/                 build, docs, simulation, audit, map and dev-server scripts
research/notes.md      raw research notes with the quotations used to verify each fact
research/facts-review.md  easy-to-read list of all facts and sources
docs/                  printable documents and reports
assets/fonts/          fonts (SIL Open Font License)
assets/music/          background music (Kevin MacLeod, CC BY 4.0; list in data/music.json); mobile/ holds the small copies for phones
assets/licenses/       every third-party license: fonts (SIL OFL), Supabase realtime client (MIT), music credits
```

**Why the printed and in-game rules always match:** both are made by the same function (`src/render/rulebook.js`) from `data/rulebook.json`, and every number in the text is filled in from `data/config.json`. That is the same file the game engine uses. The audit also checks the numbers written directly into the rules and cards.

## Supabase setup (once, for multi-device play)

Supabase only relays messages between the devices in a room. It stores nothing, and there are no tables or logins.

1. Create a free account at https://supabase.com and a new project (any name, the nearest region).
2. Open **Project Settings → API** and copy the **Project URL** and the **publishable key** (called the "anon" key on older projects).
3. Paste them into `src/net/config.js` (`SUPABASE_URL` and `SUPABASE_KEY`), then run `npm run build`, commit and push. The publishable key is meant to be public in web pages.
4. **Free projects pause after about a week without use.** Before a presentation, open the Supabase dashboard and restore the project if it says *Paused*.

Anyone who knows a room code can join that room, so codes are only for friendly games. The big screen checks every request: it only accepts moves from the device seated for the house whose turn it is, and checks each move against the rules. It is not built to stop a determined cheater with programming tools.

## Publishing on GitHub Pages

The site is served straight from the `main` branch (Settings → Pages → Deploy from a branch → `main` / root). `index.html` is the built game, so after any change run `npm run build` (or `npm run all`), commit and push, and the site updates within a minute or two. The empty `.nojekyll` file tells GitHub to serve the files exactly as they are.

## Credits

- **History:** see the Research Sheet for all 49 sources (Britannica, *Nature*, *PNAS*, *Emerging Infectious Diseases*, *The Economic History Review*, university sites, and primary sources such as Boccaccio, Guy de Chauliac and Jean de Venette).
- **Map:** coastlines, rivers and lakes from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Fonts:** EB Garamond, Cinzel and UnifrakturMaguntia, all under the SIL Open Font License (see `assets/licenses/`).
- **Music:** by Kevin MacLeod ([incompetech.com](https://incompetech.com)), licensed under [Creative Commons: By Attribution 4.0](http://creativecommons.org/licenses/by/4.0/): "The Britons" (title screen), "Lord of the Land", "Ancient Rite" and "The Pyre" (trading, early to late years), "Rites" (plague phases) and "Teller of the Tales" (final scores). See `assets/licenses/music-credits.txt`. Computers play the full-quality files in `assets/music/`; phones and tablets play smaller copies (AAC, 96 kbps) from `assets/music/mobile/`, made with `npm run music` (macOS). If the music files cannot be loaded, the game plays its own music, generated live in the browser.
- **Sound effects:** original, generated live in the browser with the Web Audio API; no recordings are used.
- **Playing on several devices:** messages between devices go through [Supabase Realtime](https://supabase.com/), using the open-source libraries `@supabase/realtime-js` (© 2020 Supabase) and `@supabase/phoenix` (© 2014 Chris McCord), both under the MIT License (see `assets/licenses/`; the texts are also at the top of the game's script). Only house names, home cities and game moves are sent; nothing is stored and there are no accounts.

*Content note:* the game deals with mass death and with the persecution of Jewish communities. It treats both seriously and without graphic detail, and it states plainly that the accusations against Jews were false and the violence unjust.

## License

The game's code and content are released under the MIT License (see `LICENSE`). The bundled fonts keep their own SIL Open Font License, the bundled Supabase realtime client libraries keep their own MIT License, and the music keeps its Creative Commons Attribution 4.0 license (all in `assets/licenses/`). The Natural Earth map data is in the public domain.
