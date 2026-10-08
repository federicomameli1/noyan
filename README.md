# Noyan

A real-time strategy and management game in the browser. You are a noyan, a general of the Mongol Empire, and your job is to keep your army alive in northern China, starting from Muqali's campaign in 1217. Supplies, fodder, horses and movement matter more than battles.

Hobby project, built in layers: first the logistics loop in a single region (layer 0), then Jin armies, stat-based battles and plunder (layer 1).

## Layer 0: Into Shanxi, 1218

Muqali's column (3,000 men, 4 horses each) starts at Datong on 1 September 1218 and has until the end of March 1219. Click a place to march there along roads, tracks and passes.

- Horses only eat by grazing. Marching hours are hours not spent eating, and winter grass is scarce and poor.
- Each herd has a **condition** (fat, changes over weeks) and a **fatigue** (tiredness, recovered in days).
- Three paces: **grazing** (15 km a day, horses eat on the way), **normal** (35 km), **forced** (55 km, pays off for two or three days, then tired horses slow down and die).
- Sheep are food on the hoof, but a column with a flock moves at the grazing pace. Flocks can be left at a place and picked up later.
- A column standing still eats the grass around its camp: a long winter stop in the plain wears the horses down.

At 1x a game day lasts 8 seconds. Every number of the rules is in `src/sim/constants.ts`, tagged as documented, modern estimate or game estimate.

## Running locally

Requires Node 22 or later.

```sh
npm install
npm run dev        # dev server with hot reload
npm test           # simulation tests (Vitest)
npm run build      # type checks and production build into dist/
```

## Structure

```
src/
  sim/     simulation: game data and rules, plain TypeScript, no DOM
             constants.ts  every tunable number of the rules
             scenario.ts   places, links and starting forces of the Shanxi scenario
             game.ts       game state, orders and the hourly step
  ui/      graphics: the SVG map and panels, reading the simulation state
  data/    pre-projected geography (coasts, rivers, relief, passes)
  main.ts  mounts the page
```

The main rule: `src/sim` must never depend on the browser. `tsconfig.sim.json` compiles that folder without the DOM type definitions, so if a simulation file uses `document` or `window` the build fails. This keeps the logic testable on its own and lets it run faster than real time later on.

## Deployment

Every push to `main` runs the tests and the build, then publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).

## Geographic data

Coasts, rivers and lakes from Natural Earth 10m (public domain). Relief from AWS Terrain Tiles (SRTM and other sources). Region borders, pasture and control values are still made up for the prototype.
