# Noyan

A real-time strategy and management game in the browser. You are a noyan, a general of the Mongol Empire, and your job is to keep your army alive in northern China, starting from Muqali's campaign in 1217. Supplies, fodder, horses and movement matter more than battles.

Hobby project, built in layers: first the logistics loop in a single region (layer 0), then Jin armies, stat-based battles, plunder and the war itself (layer 1), then the khan's orders and the Jin counter-offensive (layer 2).

**Working on it?** Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first: the state of the work, the rules of the house and the pitfalls.

## Layer 0: Into Shanxi, 1218

Muqali's column (3,000 men, 4 horses each) starts at Datong on 1 September 1218 and must take Taiyuan before the end of March 1219. Click a place to march there along roads, tracks and passes.

- Horses only eat by grazing. Marching hours are hours not spent eating, and winter grass is scarce and poor.
- Each herd has a **condition** (fat, changes over weeks) and a **fatigue** (tiredness, recovered in days).
- Three paces: **grazing** (15 km a day, horses eat on the way), **normal** (35 km), **forced** (55 km, pays off for two or three days, then tired horses slow down and die).
- Sheep are food on the hoof, but a column with a flock moves at the grazing pace. Flocks can be left at a place and picked up later.
- A column standing still eats the grass around its camp: a long winter stop in the plain wears the horses down.
- Jin towns can be besieged. Waiting costs time and grass, storming costs men. Taken towns give food, grain for the horses and, from walled towns, engineers that halve later sieges.
- You win by taking Taiyuan before 31 March 1219; you lose if spring comes first or the column falls below 1,000 men.

The map fills the screen. Hover a place to see the route and how many days it takes, click it to march there. The game pauses by itself when the column arrives or something goes wrong (thin horses, food running out). Space pauses, 1 2 3 set the speed. At 1x a game day lasts 8 seconds. Every number of the rules is in `src/sim/constants.ts`, tagged as documented, modern estimate or game estimate.

## Layer 1: the war

- **Jin armies.** The dynasty fields armies that march, relieve besieged cities, raid the flocks left behind and ride out to meet a column they judge themselves stronger than. What the scouts know of them depends on the distance: from afar an army is a size, up close its numbers, its spirit and its orders. Field armies are fed by wagon convoys from their home town; a column standing on the road falls on the wagons and the army goes hungry.
- **Battles.** A battle is decided by the strength of the two sides: the men, the state of the horses, the ground, the spirit of the men, the walls behind the Jin, and the luck of the day. The odds are shown before the battle, and the report after it says what weighed most.
- **The countryside.** The villages around a Jin place hold food, grain and livestock. Requisitioning takes a quarter of it and earns the anger of the people; plundering takes most of it, burns the fields and drives off the cattle. Angry villagers hide their food, and at the worst they steal horses at night.
- **Events.** Things happen on the road and in the camps: elders offer a tribute, a farmer offers a hidden path, loose horses run off a beaten field, a hard frost falls on a mountain camp, the frozen Fen can be crossed on the ice, a merchant caravan buys the flock, a snowstorm closes a pass. Each event is a choice, and the cost of each choice is written on the button.
- **War aims.** The campaign has goals beyond the calendar. One decisive aim ends the war when it is met; the others are honours, two of them judged as the campaign goes and two when it is over. The decisive one is always in sight in the top bar, the others are in the campaign panel.
- **Booty and remounts.** A battle costs two horses for every man lost, and nothing else on the map gives horses back. A fallen town holds goods: sack it, and the goods buy remounts from the khan's herds. The herds need ground the Mongols hold to graze on, and they take days to come.
- **The war effort.** As the campaign goes on the Jin send more armies from the south. The siege of Taiyuan can be relieved more than once: storm the walls, or starve the city out in one run.
- **Several columns.** The khan sends reinforcements, and a column standing at a place can be divided in two. Each column has its own orders, its own pace and its own siege, and two columns standing at the same place can be joined again.

## Layer 2: the war comes back

- **The khan's orders.** Taking Taiyuan no longer ends the campaign: the khan has more orders, and the war goes on until the thaw. Three letters, each with an aim and a day by which it must be fulfilled: take the city in the north, break a Jin army, take the last city in the mountains. The current order is always in the top bar, with the days left.
- **The khan's favour.** The score of the campaign: an order fulfilled earns it, an order missed spends it, a town lost spends it. When it runs out, the noyan is called back to the steppe.
- **The counter-offensive.** The Jin field army, freed from the city it was to relieve, turns north and calls on the towns the Mongols hold. A town with nobody in it is taken back, with its goods and its remounts; a town with a garrison in it is defended at the walls, and a garrison strong enough to hold them keeps the Jin away. The raiders take the sheep of the allied herders too.
- **The campaign test.** The whole war is played to the end by a noyan with a policy, in the tests: the careful one, who forages, sacks the towns and chooses his battles by the odds, must win; the one who only marches and fights must lose.

The design of the layer, and what the playtest found, are written out in `docs/layer-2.md`.

## Running locally

Requires Node 22 or later.

```sh
npm install
npm run dev        # dev server with hot reload
npm test           # simulation tests (Vitest), with the campaign report
npm run build      # type checks and production build into dist/
npm run playtest -- batch   # headless playtests: every scripted policy over ten seeds
```

`npm test` plays the whole campaign with two policies and prints the result of each: the
careful noyan, who forages and sacks the towns he takes, and the one who only marches and
fights. The balance of the war is read from those lines.

## Structure

```
src/
  sim/     simulation: game data and rules, plain TypeScript, no DOM
             constants.ts  every tunable number of the rules
             scenario.ts   places, links and starting forces of the Shanxi scenario
             game.ts       game state, orders and the hourly step
             battle.ts     the strength of two armies, the outcome and the losses
             jin.ts        the Jin armies in the field, their convoys and their reserves
             country.ts   the countryside around the Jin places
             events.ts     the events that wait for an answer
             goals.ts      the aims of the war and the orders of the khan
             booty.ts      the goods of a fallen town and the remounts they buy
             columns.ts    dividing a column, joining columns again
             journal.ts    the lines the player reads
             save.ts       saved games
  ui/      graphics: the SVG map and panels, reading the simulation state
  data/    pre-projected geography (coasts, rivers, relief, passes)
  main.ts  mounts the page
docs/
  layer-1.md  the rules of layer 1, in prose
  layer-2.md  the design of layer 2, and what the playtest found
  HANDOFF.md  a technical handover: the state of the work and the rules of the house
```

The main rule: `src/sim` must never depend on the browser. `tsconfig.sim.json` compiles that folder without the DOM type definitions, so if a simulation file uses `document` or `window` the build fails. This keeps the logic testable on its own and lets it run faster than real time later on.

## Deployment

Every push to `main` runs the tests and the build, then publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).

## Geographic data

Coasts, rivers and lakes from Natural Earth 10m (public domain). Relief from AWS Terrain Tiles (SRTM and other sources). Region borders, pasture and control values are still made up for the prototype.

## Credits

The painting on the title screen is "Pursuit by Mongol warriors", Ilkhanid Iran, early 14th century, from the Diez Albums at the Staatsbibliothek zu Berlin (public domain).
