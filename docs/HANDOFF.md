# Handoff

A technical handover for whoever works on Noyan next, human or agent. Read this file
first, then `docs/layer-1.md` (the rules of the war) and `docs/layer-2.md` (the design of
the second layer and the playtest diary).

---

## 1. What the project is

**Noyan** is a real-time strategy and management game in the browser. You are a *noyan*,
a general of the Mongol Empire, in northern China in the winter of 1218-1219, with
Muqali's column. The game is about keeping an army alive on a hostile steppe: grass,
fodder, horses, food and movement matter more than battles. You win by taking Taiyuan
before the thaw — and the war does not end there.

It is a hobby project, built in layers:

| layer | what it is | state |
|---|---|---|
| 0 | the logistics loop in one region | done |
| 1 | Jin armies, stat-based battles, plunder, the aims of the war | done |
| 2 | the khan's orders and the Jin counter-offensive | done, on the branch below |
| 3 | a second region: the march on Zhongdu | not started, see §9 |

The repository is `federicomameli1/noyan`, deployed automatically to GitHub Pages on
every push to `main` (`.github/workflows/pages.yml`: tests + typecheck + build).

## 2. Where the work is

- **`main`** is the integration branch. It is deployed to GitHub Pages.
- **`feature/layer-1`** is the branch with layers 1 and 2: **25 commits ahead of main**,
  29 files, +2342/-110 lines, 222 tests. It is **not pushed** and **not merged**.
- Everything in this document describes `feature/layer-1`. `main` is one layer behind
  and has the old shape of the game.

```sh
git checkout feature/layer-1     # the work
git log --oneline main..HEAD     # what is in it
git diff main..HEAD              # all of it
```

There are also old local branches (`claude/*`, `battles-part-*`) left over from earlier
work. They are merged into `main` and can be deleted.

## 3. The rules of the house

These are invariants. A change that breaks one is a bug, even if the tests pass.

1. **`src/sim/` never touches the browser.** No `document`, `window`, `localStorage`,
   `console`. `tsconfig.sim.json` compiles that folder without the DOM lib, so the build
   fails if you break the rule. (A test file may declare `console` locally, for the
   campaign report.)
2. **`src/ui/` and `src/main.ts` read the simulation, they never write it.** The only way
   to change the game is through the order functions in `src/sim/game.ts` and its
   siblings. `main.ts` never assigns to `game.*`.
3. **Every tunable number lives in `src/sim/constants.ts`,** tagged `[D]` documented,
   `[R]` modern estimate, `[S]` game estimate. Dates the rules need (the khan's
   deadlines) live there too, as `GameDate` constants. No magic numbers in the logic.
4. **The game state is plain JSON.** `GameState`, `Column`, `CityState`, `SiteState`,
   `JinArmy` are interfaces with plain data: no classes, no references to the graph, no
   `Map`/`Set`. It is written to disk, so it must stay serializable.
5. **Every new state field needs three things:** an initial value in `newGame()`, a
   check in the save validator (`src/sim/save.ts`), and a bump of `SAVE_VERSION`.
6. **The simulation is driven by the hour.** `step(s)` advances one game hour. The
   interface runs it at 8 real seconds per game day at 1x. Nothing in `src/sim` may
   assume a player is present: the game must stay playable (and finish) unattended.
7. **The code and its comments are in English.** The game's prose (the khan's letters,
   the journal) is in English too.

## 4. The architecture

```
src/
  sim/       the game: plain TypeScript, no DOM
    constants.ts   every tunable number of the rules
    scenario.ts    the map: places, links, starting forces, Jin reserves
    graph.ts       the movement graph, path finding
    calendar.ts    the game clock (hours since 1 September 1218)
    world.ts       coarse region data for the background map (not the playable map)
    projection.ts  the map projection
    game.ts        the state, the orders, the hourly step, the day end
    battle.ts      the strength of two armies, the outcome, the losses
    jin.ts         the Jin armies: their orders, their convoys, their reserves
    country.ts     the countryside around the Jin places
    events.ts      the events that wait for an answer
    goals.ts       the aims of the war and the orders of the khan
    booty.ts       the goods of a fallen town and the remounts they buy
    columns.ts     dividing a column, joining columns again
    journal.ts     the lines the player reads (a leaf: no runtime imports)
    save.ts        building and validating saved games
    index.ts       the public surface of the simulation
  ui/
    map.ts         the SVG map: layers, marks, tooltips, zoom
    geo.ts         the pre-projected geography
    saves.ts       local storage, export and import
  data/geo.json    the pre-projected geography (one long line)
  main.ts           mounts the page, draws the panels, runs the loop
  style.css
```

**The dependency direction** is `main.ts → sim/index.ts → sim modules`. Inside `src/sim`
the graph is not acyclic: `game.ts` imports from `country.ts`, `events.ts`, `jin.ts`,
`booty.ts` and `goals.ts`, and those import back from `game.ts`. This is deliberate and
safe as long as nothing is *called* at module-evaluation time: ES module live bindings
make the functions available, and every call happens at runtime. `journal.ts` was
extracted to `src/sim/journal.ts` precisely to break one of these cycles: it imports
only the *type* of `GameState`, so it is a leaf at runtime. Prefer that pattern for new
modules: import types with `import type`, and keep runtime imports one-way.

**The playable map** is `scenario.ts`: 48 places and 47 links between them, in northern
Shanxi and western Hebei, 1 September 1218 to 31 March 1219; nine of the places are
Jin strongholds that can be besieged. The coarse map of the whole of northern China in
`world.ts` and `data/geo.json` is only the background of the SVG map, with its own
regions, cities and roads.

## 5. The simulation, in one page

**The state** (`src/sim/game.ts`): `hour`, `columns[]`, `jin[]`, `convoys[]`, `sites{}`,
`cities{}`, `log[]`, plus the campaign state: `dispatch`, `favour`, `dispatchResults[]`,
`wins`, `winsAtDispatch`, `treasury`, `remounts[]`, `arrived`, `jinArrived`.

**An hour** (`step(s)`): the pending event is answered with its default if nobody
answered it; the columns forage and march; the Jin armies move, feed and ask; the booty
and the remounts move; the events are raised; the khan's orders are looked at; the clock
advances; at midnight the day ends.

**A day** (`endOfDay`): the countryside eats and cools, the herders' herds grow, each
column's horses graze and lose condition, the men eat, the sieges advance, the cities
eat their stores, the garrisons may sally out, and the Jin decide what to do.

**The orders** (all in `game.ts` unless said): `orderMarch`, `orderSiege`, `orderStorm`,
`orderFight`, `orderRefuse`, `orderSurrender`, `orderHalt`, `setPace`, `dropFlock`,
`takeFlock`, `takeFromHerders`, `leaveBlockade`, plus `orderForage` (country.ts),
`orderSack`/`orderRemounts` (booty.ts), `orderSplit`/`orderMerge` (columns.ts),
`chooseEvent` (events.ts).

**The events**: each has choices with their cost written on the button; while one waits
the interface stops time. The **last choice is the default**: what happens if nobody
chooses is the choice that changes the least, so an unattended game never gets stuck.
A choice can declare itself unavailable (`disabled`), and the interface greys it out.

**The khan's orders**: three letters, each with an aim and a day by which it must be
fulfilled. `goals.ts` decides when one is fulfilled or missed, and moves the favour.
The decisive aim of the moment is in the top bar.

## 6. The rules, briefly

Full prose in `docs/layer-1.md` and `docs/layer-2.md`. The short version:

- **Horses eat by grazing.** Marching hours are hours not spent eating. Each herd has a
  *condition* (fat, changes over weeks) and a *fatigue* (recovered by resting). Three
  paces: grazing (15 km/day, the horses eat on the way), normal (35), forced (55, and
  the horses die of it after two or three days).
- **A column is 3000 men, 4 horses each, 20 rations each.** It is outnumbered by
  everything: the Jin field army is 8500 men and beats the Mongols in numbers and loses
  in quality. A battle is decided by men, the state of the horses, the ground, the
  morale, the walls and the luck of the day.
- **The food is the campaign.** A campaign is 150 days of 3000-5000 men eating. The
  villages hold some, the towns' spoils hold a lot, the sheep are the reserve, and the
  herders' flocks are the remount herds. A column that does not manage this eats its
  horses and then its men.
- **The war is two-way (layer 2).** The Jin take towns back. A town with nobody in it is
  lost; a town with a garrison is defended at the walls, and a watch of a thousand men
  is not enough for a walled city.

## 7. The workflow

```sh
npm install
npm run dev       # the dev server, with hot reload
npm test          # the simulation tests, and the campaign report
npm run build     # typecheck (both configs) and the production build into dist/
npm run playtest -- help   # play the campaign headless: policies, batches, turn by turn
```

Node 22 or later. `npm test` prints the campaign report at the end of the run: the
careful noyan must win, the one who only marches and fights must lose. **That report is
the instrument of the balance**: change a number, run the tests, read the two lines.
For more than two lines, `npm run playtest -- batch` plays every scripted policy over ten
seeds, and `run` or `turn` show one campaign closely; see `.claude/skills/playtest/SKILL.md`.

**The git flow**: a feature branch, commits by topic, a pull request into `main`. The
commits are written in the imperative and explain *why*, not *what*: the diff says what.
Example: "The war comes back: the Jin call on the towns the Mongols hold".

**Before you commit**: `npm test` and `npm run build` must both be green. If you touched
the state, bump `SAVE_VERSION` and extend the validator.

**The tests** live next to the code (`foo.ts` and `foo.test.ts`), in Vitest, in the style
of the file they test. A new rule wants a test of its own. A rule that changes the
campaign wants a line in the campaign report.

## 8. The pitfalls that have bitten us

Each of these cost a real bug. They are all in the history of the branch.

- **The months are counted from zero.** `GameDate.month` is 0 = January. A date written
  as `month: 9` is *October*. The Jin reserves were a month late because of this.
- **A day is judged at its end.** An order due on 31 December is lost at the end of that
  day, not at midnight of it.
- **Do not shorten an array while you are iterating it.** The remounts that were due in
  the same hour were skipped when the list was spliced inside a `for...of` over it.
- **Columns are referred to by index.** `s.threat.column`, `s.event.column` and the
  interface's `active` are indexes into `s.columns`. When a column is removed
  (`orderMerge`), those indexes must be fixed, and the interface must adjust `active`.
  When a column is added, it is appended, and the indexes do not move.
- **A Jin army knows what it is for.** The order it relieves is kept in the state
  (`JinArmy.relieve`), not looked up by name: the armies have names, and the names
  repeat.
- **A call on a town is a standing order.** The Jin army asks again every hour until
  the player answers. It is not a one-off event, and it must not be dropped when another
  threat is waiting.
- **The walls belong to the city.** `wallsOf(s, id)` reads `city.walls`, not the walls of
  the city's kind: Taiyuan has walls of its own.
- **The save validator is the gate.** Anything the state can hold that comes from outside
  (a file, an old save) has to be checked there, or the game breaks at midnight.

## 9. What is open

In the order I would take them up.

1. **The honour "hold two cities to the end" is too hard.** Taking Taiyuan leaves the
   column too weak to garrison it. Either lower the honour to one city, or give the
   player a way to reinforce a garrison (reinforcements from the khan, cheaper remounts).
   The campaign test asserts the current behaviour; change both together.
2. **Layer 3: a second region.** The march on Zhongdu in 1219, with a map of its own.
   `data/geo.json` and `world.ts` already cover the whole of northern China, so what it
   needs is a new graph of places and links (hand-built, like `scenario.ts`), a new
   scenario, and a new balance. It is a layer of its own, not an extension.
3. **The interface is untested.** `src/ui/map.ts` and `src/main.ts` have no tests at
   all, and no DOM test runner is set up. The simulation is well covered; the interface
   is covered by the eye. Adding a DOM test (jsdom or happy-dom) would be a real gain.
4. **The design documents of layer 0 are missing.** The comments refer to
   "03-regole-strato-0" and "07-regole-strato-1", which are not in the repository.
   `docs/layer-1.md` and `docs/layer-2.md` are the ones that exist.
5. **The diplomacy layer of the map is static.** The political and diplomatic layers
   (`src/ui/map.ts`, `world.ts`) show the regions of the whole of China as they were
   drawn for the prototype, and they do not follow the war. The playable places do
   (the towns change hands and the map follows).
6. **The balance of the layer 1 numbers has never been played by a human.** Everything
   was tuned by playing the campaign with a policy in a test. A person playing will find
   things the policy cannot: the pleasure of the map, the cost of a lost town, the
   rhythm of the orders.

## 10. A checklist for the next change

- [ ] The rules are in `constants.ts`, with a tag and a reason.
- [ ] The new state is initialized in `newGame()`, checked in `save.ts`, and
      `SAVE_VERSION` is bumped.
- [ ] The simulation never touches the browser; the interface never writes the state.
- [ ] There is a test for the new rule, next to the code.
- [ ] If it changes the campaign, the campaign report has been read before and after.
- [ ] `npm test` and `npm run build` are green.
- [ ] The commit explains why, in the imperative, in one subject line and a body.
- [ ] If a design decision was made, `docs/` says so.

## 11. Where the things are, precisely

| what | where |
|---|---|
| every number of the rules | `src/sim/constants.ts` (367 lines, by topic) |
| the map of the campaign | `src/sim/scenario.ts` |
| the state and the orders | `src/sim/game.ts` (1071 lines, the biggest file) |
| the Jin armies | `src/sim/jin.ts` (546 lines) |
| the events | `src/sim/events.ts` (324 lines) |
| the orders of the khan | `src/sim/goals.ts` (232 lines) |
| the interface | `src/main.ts` (899 lines) and `src/ui/map.ts` (796 lines) |
| the rules of the war, in prose | `docs/layer-1.md` |
| the design of layer 2 and the playtest diary | `docs/layer-2.md` |
| the campaign and its report | `src/sim/campaign.test.ts` |
| the playtest kit (policies, digests, turn-by-turn play) | `src/sim/playtest/`, `scripts/playtest.mjs` |
| the saved games | `src/sim/save.ts`, `src/ui/saves.ts` |
