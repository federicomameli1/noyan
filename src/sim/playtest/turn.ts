// Turn-by-turn play from the command line: the state lives in a JSON file, each call gives
// orders in a few words, runs the game until something needs the player, and prints what
// changed. Meant for an agent playing the game the way a person would, decision by decision.

import { orderRemounts, orderSack, remountsAffordable } from "../booty";
import { orderMerge, orderSplit } from "../columns";
import { PACES, type PaceId } from "../constants";
import { forageBlock, orderForage, slaughterFlock, type ForageKind } from "../country";
import { chooseEvent, eventView } from "../events";
import { currentAim, dispatchTime, objectiveOf } from "../goals";
import {
  battleInput, battleOdds, canAttack, canBesiege, conditionBand, dropFlock, foodDays, forecast, isMoving, leaveBlockade,
  orderAttack, orderFight, orderHalt, orderMarch, orderRefuse, orderSiege, orderStorm, orderSurrender, planRoute, reliefHelpers,
  setPace, siegeDays, step, stormCost, takeFlock, takeFromHerders, wallsOf, type GameState,
} from "../game";
import { armyMen, describeOrder, describeSighting } from "../jin";
import { SCENARIO } from "../scenario";
import { journalLines } from "./digest";
import { longDate, Watcher, whereOf } from "./run";

const graph = SCENARIO.graph;

/** Finds a site by id, or by the start of its name. */
export function findSite(q: string): string | null {
  const l = q.toLowerCase();
  const exact = graph.sites.find(x => x.id === l || x.name.toLowerCase() === l);
  if (exact) return exact.id;
  const some = graph.sites.filter(x => x.id.startsWith(l) || x.name.toLowerCase().startsWith(l));
  return some.length === 1 ? some[0].id : null;
}

const odds = (s: GameState, ci: number, armyIndex: number, helpers = 0, walls = 1) => {
  const o = battleOdds(battleInput(s, s.columns[ci], s.jin[armyIndex], helpers, walls));
  return `${o.worst.outcome}/${o.even.outcome}/${o.best.outcome} (worst/even/best luck)`;
};

export const COMMANDS = [
  "march C SITE", "route C SITE (plan only)", "halt C", "pace C grazing|normal|forced", "siege C", "storm C", "attack C",
  "forage C requisition|plunder", "sack C", "split C MEN", "merge C D", "drop C", "take C", "herders C N", "remounts C N",
  "slaughter C", "leave C", "fight", "refuse", "surrender", "choose N",
];

/**
 * Gives one order, written as in COMMANDS (C and D are column numbers; SITE an id or a name).
 * Returns what came of it, in one line.
 */
export function applyCommand(s: GameState, line: string): string {
  const [verb, ...args] = line.trim().split(/\s+/);
  const ci = Number(args[0] ?? 0);
  const c = s.columns[ci];
  const needColumn = !["fight", "refuse", "surrender", "choose"].includes(verb);
  if (needColumn && !c) return `${line}: no column ${args[0]}`;
  const ok = (done: boolean, why = "refused") => `${line}: ${done ? "ok" : why}`;
  switch (verb) {
    case "march": case "route": {
      const site = findSite(args.slice(1).join(" "));
      if (!site) return `${line}: unknown or ambiguous site`;
      const plan = planRoute(s, c, site);
      if (!plan) return `${line}: no road there`;
      const f = forecast(s, ci, site, 60);
      const info = `${Math.round(plan.km)} km, ~${Math.round(plan.days)} days via ${plan.sites.join(",")}`
        + (f ? `; on arrival: condition ${Math.round(f.end.condition)}, food ${f.end.foodDays.toFixed(0)}d${f.end.starving ? ", STARVING" : ""}` : "");
      if (verb === "route") return `${line}: ${info}`;
      return ok(orderMarch(s, ci, site)) + ` (${info})`;
    }
    case "halt": orderHalt(s, ci); return ok(true);
    case "pace": {
      if (!(args[1] in PACES)) return `${line}: pace is one of ${Object.keys(PACES).join(", ")}`;
      setPace(s, ci, args[1] as PaceId); return ok(true);
    }
    case "siege": return ok(orderSiege(s, ci), canBesiege(s, c) ? "refused" : "nothing to besiege here");
    case "storm": return ok(orderStorm(s, ci));
    case "attack": return ok(orderAttack(s, ci), "no army here to attack");
    case "forage": {
      const kind = (args[1] ?? "requisition") as ForageKind;
      const block = forageBlock(s, c, kind);
      return block ? `${line}: ${block}` : ok(orderForage(s, ci, kind));
    }
    case "sack": return ok(orderSack(s, ci));
    case "split": return ok(orderSplit(s, ci, Number(args[1])));
    case "merge": return ok(orderMerge(s, ci, Number(args[1])));
    case "drop": return ok(dropFlock(s, ci));
    case "take": return ok(takeFlock(s, ci));
    case "herders": return ok(takeFromHerders(s, ci, Number(args[1])));
    case "remounts": return ok(orderRemounts(s, ci, Number(args[1])), `refused (affordable: ${remountsAffordable(s)})`);
    case "slaughter": return ok(slaughterFlock(s, ci));
    case "leave": return ok(leaveBlockade(s, ci));
    case "fight": return ok(orderFight(s), "no threat to answer");
    case "refuse": return ok(orderRefuse(s), "cannot refuse");
    case "surrender": return ok(orderSurrender(s), "cannot give the town up");
    case "choose": return ok(chooseEvent(s, Number(args[0])), "no event, or no such choice");
    default: return `${line}: unknown order; orders are: ${COMMANDS.join("; ")}`;
  }
}

const pendingThreat = (s: GameState): GameState["threat"] => s.threat;

export interface Advance {
  /** why the game stopped */
  reason: string;
  hours: number;
  /** journal lines written while it ran */
  log: string[];
}

/**
 * Runs the game until the player is needed: a threat or an event, an arrival or an alert in
 * the journal, a column that stops marching or finishes foraging, the end of the campaign,
 * or `maxHours`. Refuses to run while a threat waits: the interface would be paused.
 */
export function advance(s: GameState, maxHours: number, width = 140, all = false): Advance {
  if (s.threat) return { reason: "a threat waits for an answer: fight, refuse or surrender", hours: 0, log: [] };
  const start = s.hour, logStart = s.log.length;
  const unanswered = s.event ? `event ${s.event.id} left unanswered: it takes its last choice` : null;
  const watch = new Watcher(s);
  const busy = () => s.columns.map(c => isMoving(c) || !!c.foraging);
  let reason = `${Math.round(maxHours / 24)} days passed`;
  while (!s.over && s.hour - start < maxHours) {
    const before = busy();
    step(s);
    watch.observe(s);
    if (s.over) { reason = `the campaign is over: ${s.result}`; break; }
    // read through a function: step() changes the state behind the narrowing of the check above
    const t = pendingThreat(s);
    if (t) { reason = `threat: ${t.kind} at ${t.site}`; break; }
    if (s.event) { reason = `event: ${s.event.id} at ${s.event.site}`; break; }
    if (s.log.slice(logStart).some(l => l.kind === "arrival" || l.kind === "alert")) { reason = "news in the journal"; break; }
    const after = busy();
    const done = after.findIndex((b, i) => before[i] && !b);
    if (done >= 0) { reason = `${s.columns[done].name} is idle at ${s.columns[done].at ?? "?"}`; break; }
  }
  const log = journalLines(s.log.slice(logStart), all ? "all" : "key", width);
  if (unanswered) log.unshift(unanswered);
  // the battles are in the journal already; the watcher adds the numbers
  for (const b of watch.battles) log.push(`battle ${b.site}: ${b.outcome} x${b.ratio}, lost ${b.mongolLost} / ${b.jinLost}`);
  return { reason, hours: s.hour - start, log };
}

/** What the player sees now, in a few lines. With `all`, also what the scouts do not see. */
export function situation(s: GameState, all = false): string {
  const out: string[] = [];
  const aim = currentAim(s), t = dispatchTime(s);
  out.push(`${longDate(s)} ${String(s.hour % 24).padStart(2, "0")}:00 (day ${Math.floor(s.hour / 24)})${s.over ? ` OVER: ${s.result}` : ""}`);
  out.push(`order: ${aim ? `${aim.name}, ${t.left} days left (due ${t.due})` : "none"} | favour ${Math.round(s.favour)} | treasury ${Math.round(s.treasury)} | orders ${s.dispatchResults.join(",") || "-"}`);
  for (const [i, c] of s.columns.entries()) {
    if (c.men <= 0) continue;
    const bits = [
      `[${i}] ${c.name} @${whereOf(c)}${c.route.length ? ` ->${c.route.at(-1)}` : ""}`,
      `${Math.round(c.men)} men ${Math.round(c.horses)} horses ${Math.round(c.sheep)} sheep`,
      `cond ${Math.round(c.condition)} (${conditionBand(c.condition)}) tired ${Math.round(c.fatigue)} mor ${Math.round(c.morale)}`,
      `food ${foodDays(c).toFixed(0)}d grain ${Math.round(c.grain)}d pace ${c.pace}${c.halted ? " halted" : ""}`,
    ];
    if (c.foraging) bits.push(`foraging (${c.foraging.kind})`);
    if (c.siege) {
      const city = s.cities[c.siege];
      bits.push(`siege ${Math.round(city.progress)}% ~${Math.round(siegeDays(s, c, c.siege))}d left, storm costs ${stormCost(city)} men`);
    }
    if (c.waiting) bits.push(`barred at ${c.waiting}`);
    out.push(bits.join(" | "));
  }
  const obj = objectiveOf(s);
  if (obj) {
    const city = s.cities[obj];
    out.push(`objective ${obj}: garrison ${city.garrison}, walls ${city.walls}, stores ${Math.round(city.stores)}d, ${city.taken ? "TAKEN" : `${Math.round(city.progress)}%`}`);
  }
  const held = Object.entries(s.cities).filter(([, x]) => x.taken).map(([id, x]) => `${id}${x.sacked ? "(sacked)" : ""}`);
  if (held.length) out.push(`towns held: ${held.join(", ")}`);
  for (const a of s.jin) {
    if (armyMen(a) <= 0) continue;
    if (all) out.push(`jin ${a.name}: ${Math.round(a.foot)}f ${Math.round(a.horse)}h @${whereOf(a)} ${a.order}${a.target ? `>${a.target}` : ""} food ${Math.round(a.food)}d sight ${a.sight}`);
    else if (a.seen) out.push(`scouts (d${Math.floor(a.seen.hour / 24)}): ${describeSighting(a.seen, a.name)} near ${a.seen.site}${a.seen.level >= 3 ? `, ${describeOrder(a.seen)}` : ""}`);
  }
  if (s.threat) {
    const th = s.threat, a = s.jin[th.army];
    const walls = th.kind === "call" ? wallsOf(s, th.site) : 1;
    out.push(`THREAT ${th.kind} at ${th.site}: ${a.name} upon [${th.column}]; odds if you fight ${odds(s, th.column, th.army, reliefHelpers(s), walls)}. Answer: fight | refuse${th.kind === "call" ? " | surrender" : ""}`);
  }
  const ev = eventView(s);
  if (ev) {
    out.push(`EVENT ${ev.title}: ${ev.text}`);
    ev.choices.forEach((ch, n) => out.push(`  choose ${n}: ${ch.label} (${ch.cost})${ch.disabled ? " [not possible]" : ""}`));
  }
  for (const [i, c] of s.columns.entries()) {
    const foe = c.men > 0 ? canAttack(s, i) : null;
    if (foe) out.push(`[${i}] can attack ${foe.name}: ${odds(s, i, s.jin.indexOf(foe))}`);
  }
  return out.join("\n");
}

/** The roads out of a site, for an agent that does not know the map. */
export function neighbours(id: string): string {
  const links = graph.links.filter(l => l.a === id || l.b === id);
  return `${id} (${graph.site(id).kind}, ${graph.site(id).terrain}): ` + links.map(l => `${l.a === id ? l.b : l.a} ${Math.round(l.km)}km ${l.kind}`).join(", ");
}
