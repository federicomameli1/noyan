# Noyan

A real-time strategy and management game in the browser. You are a noyan, a general of the Mongol Empire, and your job is to keep your army alive in northern China, starting from Muqali's campaign in 1217. Supplies, fodder, horses and movement matter more than battles.

Hobby project, built in layers: first the logistics loop in a single region (layer 0), then Jin armies, stat-based battles and plunder (layer 1).

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
  ui/      graphics: the SVG map and panels, reading the simulation state
  data/    pre-projected geography (coasts, rivers, relief, passes)
  main.ts  mounts the page
```

The main rule: `src/sim` must never depend on the browser. `tsconfig.sim.json` compiles that folder without the DOM type definitions, so if a simulation file uses `document` or `window` the build fails. This keeps the logic testable on its own and lets it run faster than real time later on.

## Deployment

Every push to `main` runs the tests and the build, then publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).

## Geographic data

Coasts, rivers and lakes from Natural Earth 10m (public domain). Relief from AWS Terrain Tiles (SRTM and other sources). Region borders, pasture and control values are still made up for the prototype.
