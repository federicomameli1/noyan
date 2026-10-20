// Command line for the playtest kit in src/sim/playtest. Runs the simulation in Node, no browser.
// All the game logic is in TypeScript; this file only reads arguments, files and prints.
// Usage: npm run playtest -- help
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runnerImport } from "vite";

const HELP = `npm run playtest -- <command> [options]

  run      play a whole campaign with a policy and print a digest
           --policy careful  --seed N  --sheep 0|3000|6000  --days N (stop early)
           --every 10 (timeline rows, 0 = none)  --log key|all|none  --width 100 (0 = whole lines)  --nofold
  batch    many campaigns, one line each and a summary per policy
           --policy direct,careful  --seeds 10  --from 1  --sheep N
  new      start a campaign to play turn by turn, saved in a file
           FILE (default .playtest/game.json)  --sheep N  --seed N
  turn     give orders, run until the player is needed, print what changed
           FILE  --do "march 0 taiyuan" (repeatable, or ; separated)  --days 30 (most time to run, 0 = give orders only)
           --all (every journal line)
  look     the situation now: FILE  --all (also what the scouts do not see)
  map      the roads out of a site: map SITE, or map alone for every site
  policies the scripted players

Orders for --do:
  ${"%COMMANDS%"}
C is a column number ([0] in the situation), SITE an id or the start of a name.`;

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const key = a.slice(2), next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? true : (i++, next);
    if (key === "do") opt.do = [...(opt.do ?? []), ...String(value).split(";").map(x => x.trim()).filter(Boolean)];
    else opt[key] = value;
  }
  return { pos, opt };
}

const num = (v, d) => (v === undefined || v === true ? d : Number(v));

const { module: P } = await runnerImport("/src/sim/playtest/index.ts", { logLevel: "silent" });
const [command = "help", ...rest] = process.argv.slice(2);
const { pos, opt } = parse(rest);
const file = pos[0] ?? ".playtest/game.json";
const load = () => JSON.parse(readFileSync(file, "utf8"));
const save = s => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(s)); };

switch (command) {
  case "run": {
    const r = P.runGame({ policy: opt.policy ?? "careful", seed: opt.seed === undefined ? undefined : num(opt.seed), sheep: num(opt.sheep, undefined), maxDays: num(opt.days, undefined) });
    console.log(P.formatRun(r, { every: num(opt.every, 10), log: opt.log ?? "key", width: num(opt.width, 100), fold: !opt.nofold }));
    break;
  }
  case "batch": {
    const policies = String(opt.policy ?? Object.keys(P.POLICIES).join(",")).split(",");
    const from = num(opt.from, 1), n = num(opt.seeds, 10);
    const runs = [];
    for (const policy of policies) for (let seed = from; seed < from + n; seed++) runs.push(P.runGame({ policy, seed, sheep: num(opt.sheep, undefined) }));
    console.log(P.formatBatch(runs));
    break;
  }
  case "new": {
    const s = P.newGame(num(opt.sheep, 6000));
    if (opt.seed !== undefined) s.rng = num(opt.seed);
    save(s);
    console.log(`saved ${file}\n${P.journalLines(s.log, "all", num(opt.width, 0)).join("\n")}\n${P.situation(s)}`);
    break;
  }
  case "turn": {
    const s = load();
    for (const line of opt.do ?? []) console.log("> " + P.applyCommand(s, line));
    const days = num(opt.days, 30);
    if (days > 0) {
      const a = P.advance(s, days * 24, num(opt.width, 140), !!opt.all);
      console.log(`ran ${Math.round(a.hours / 24 * 10) / 10} days, stopped: ${a.reason}`);
      if (a.log.length) console.log(a.log.join("\n"));
    }
    save(s);
    console.log(P.situation(s));
    break;
  }
  case "look": console.log(P.situation(load(), !!opt.all)); break;
  case "map": {
    const ids = pos.length ? [P.findSite(pos.join(" "))] : P.SCENARIO.graph.sites.map(x => x.id);
    for (const id of ids) console.log(id ? P.neighbours(id) : "unknown site");
    break;
  }
  case "policies": for (const p of Object.values(P.POLICIES)) console.log(`${p.id}: ${p.desc}`); break;
  default: console.log(HELP.replace("%COMMANDS%", P.COMMANDS.join("\n  ")));
}
