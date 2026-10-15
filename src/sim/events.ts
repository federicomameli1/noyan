// Events at places (layer 2): short texts that appear when something happens to a column, each with
// two choices whose cost is written on the button. While one waits for an answer the interface stops
// time. The LAST choice of each event is the default: what happens if nobody chooses, the one that
// changes the least, so a simulation with no player never gets stuck. Numbers in constants.ts.

import * as R from "./constants";
import { dateOf, jumpAhead, log, random, type Column, type GameState, type PendingEvent } from "./game";
import { orderForage, population } from "./country";
import { linkBetween } from "./graph";
import { SCENARIO } from "./scenario";

const graph = SCENARIO.graph;
const fmt = (n: number) => Math.round(n).toLocaleString("en");
/** A share as the whole number the player reads on the button: 0.3 becomes 30. */
const pct = (x: number) => Math.round(x * 100);

export type EventId = "tribute" | "frost" | "herd" | "guides" | "deserters" | "ice";

/** One choice of an event: what the button says, and what it costs. */
export interface EventChoice {
  label: string;
  cost: string;
}

interface EventDef {
  title: string;
  /** "site": once for each place · "game": once in the whole campaign */
  once: "site" | "game";
  text(s: GameState, ev: PendingEvent): string;
  choices(s: GameState, ev: PendingEvent): EventChoice[];
  apply(s: GameState, ev: PendingEvent, choice: number): void;
}

/** Days of grain a number of horse-days is worth to a column, as stepForage counts it. */
const grainDays = (grain: number, horses: number) => (horses > 0 ? grain / horses : 0);

/** The share of a place's stores the elders would give up to be spared. */
function tributeShare(s: GameState, ev: PendingEvent) {
  const st = s.sites[ev.site];
  return { food: st.food * R.TRIBUTE_SHARE, grain: st.grain * R.TRIBUTE_SHARE, livestock: st.livestock * R.TRIBUTE_SHARE };
}

const EVENTS: Record<EventId, EventDef> = {
  tribute: {
    title: "Tribute offered",
    once: "site",
    text: (_s, ev) => `The elders of the villages around ${graph.site(ev.site).name} offer a third of what they hold if the column spares them.`,
    choices: (s, ev) => {
      const c = s.columns[ev.column], t = tributeShare(s, ev);
      return [
        { label: "Accept the tribute", cost: `+${fmt(t.food)} rations, +${grainDays(t.grain, c.horses).toFixed(1)} days of grain, +${fmt(t.livestock)} livestock. Hostility −${R.TRIBUTE_CALM}` },
        { label: "Sack them anyway", cost: "the plunder goes ahead" },
      ];
    },
    apply: (s, ev, choice) => {
      if (choice === 1) {
        orderForage(s, ev.column, "plunder"); // the key is done: it goes ahead without asking again
        return;
      }
      const c = s.columns[ev.column], st = s.sites[ev.site], t = tributeShare(s, ev);
      c.rations += t.food;
      if (c.horses > 0) c.grain += t.grain / c.horses;
      c.sheep += t.livestock;
      st.food -= t.food;
      st.grain -= t.grain;
      st.livestock -= t.livestock;
      st.hostility = Math.max(0, st.hostility - R.TRIBUTE_CALM);
      log(s, `${c.name} spares the villages around ${graph.site(ev.site).name} and takes the tribute: ${fmt(t.food)} rations, `
        + `${grainDays(t.grain, c.horses).toFixed(1)} days of grain for the horses and ${fmt(t.livestock)} head of livestock.`);
    },
  },
  frost: {
    title: "Hard frost",
    once: "game",
    text: () => "A hard frost falls on the mountain camp in the night; the horses shiver.",
    choices: () => [
      { label: "Rest a day by the fires", cost: `one day lost, fatigue −${R.FROST_REST}` },
      { label: "March on through the cold", cost: `condition −${R.FROST_COLD}` },
    ],
    apply: (s, ev, choice) => {
      const c = s.columns[ev.column];
      if (choice === 1) {
        c.condition = Math.max(0, c.condition - R.FROST_COLD);
        log(s, `${c.name} marches on through the frost and the horses pay for it.`);
        return;
      }
      c.restUntil = s.hour + 24;
      c.fatigue = Math.max(0, c.fatigue - R.FROST_REST);
      log(s, `${c.name} rests a day by the fires in the mountains.`);
    },
  },
  herd: {
    title: "Loose horses",
    once: "site",
    text: () => `${fmt(R.HERD_HORSES)} Jin horses run loose over the battlefield.`,
    choices: () => [
      { label: "Round them up", cost: `half a day lost, +${R.HERD_HORSES} thin horses` },
      { label: "Let them go", cost: "nothing" },
    ],
    apply: (s, ev, choice) => {
      const c = s.columns[ev.column];
      if (choice === 1) {
        log(s, `${c.name} leaves the loose horses to run.`);
        return;
      }
      c.restUntil = s.hour + 12;
      // the thin horses water down the condition of the herd
      c.condition = (c.condition * c.horses + R.HERD_CONDITION * R.HERD_HORSES) / (c.horses + R.HERD_HORSES);
      c.horses += R.HERD_HORSES;
      log(s, `${c.name} rounds up ${fmt(R.HERD_HORSES)} thin horses.`);
    },
  },
  guides: {
    title: "A guide offered",
    once: "site",
    text: (_s, ev) => `A farmer at ${graph.site(ev.site).name} offers to lead the column by a hidden path through the mountains.`,
    choices: () => [
      { label: "Follow the guide", cost: `${pct(1 - R.GUIDES_TRAP)}%: ${R.GUIDES_KM} km saved; ${pct(R.GUIDES_TRAP)}%: an ambush, −${pct(R.GUIDES_LOSS)}% men and horses, morale −${R.GUIDES_MORALE}` },
      { label: "Keep to the road", cost: "nothing" },
    ],
    apply: (s, ev, choice) => {
      const c = s.columns[ev.column];
      if (choice === 1) {
        log(s, `${c.name} keeps to the road.`);
        return;
      }
      if (random(s) < R.GUIDES_TRAP) {
        const men = Math.round(c.men * R.GUIDES_LOSS), horses = Math.round(c.horses * R.GUIDES_LOSS);
        c.men = Math.max(0, c.men - men);
        c.horses = Math.max(0, c.horses - horses);
        c.morale = Math.max(0, c.morale - R.GUIDES_MORALE);
        log(s, `The guide was a trap: Jin horsemen wait on the path. ${c.name} loses ${fmt(men)} men and ${fmt(horses)} horses, and the men's spirit suffers.`, "alert");
        return;
      }
      const km = jumpAhead(s, c, R.GUIDES_KM);
      log(s, `${c.name} follows the guide by a hidden path through the mountains, ${fmt(km)} km on.`);
    },
  },
  deserters: {
    title: "Khitan deserters",
    once: "site",
    text: () => `${fmt(R.DESERTERS_MEN)} Khitan horsemen of the beaten army ask to serve the Mongols.`,
    choices: () => [
      { label: "Take them in", cost: `+${fmt(R.DESERTERS_MEN)} men, +${fmt(R.DESERTERS_HORSES)} horses; morale −${R.DESERTERS_MORALE}, they are not trusted yet` },
      { label: "Send them away", cost: "nothing" },
    ],
    apply: (s, ev, choice) => {
      const c = s.columns[ev.column];
      if (choice === 1) {
        log(s, `${c.name} sends the Khitan horsemen away.`);
        return;
      }
      // their thin horses water down the condition of the herd
      c.condition = (c.condition * c.horses + R.DESERTERS_CONDITION * R.DESERTERS_HORSES) / (c.horses + R.DESERTERS_HORSES);
      c.men += R.DESERTERS_MEN;
      c.horses += R.DESERTERS_HORSES;
      c.morale = Math.max(0, c.morale - R.DESERTERS_MORALE);
      log(s, `${c.name} takes in ${fmt(R.DESERTERS_MEN)} Khitan horsemen with ${fmt(R.DESERTERS_HORSES)} horses. They are not trusted yet.`);
    },
  },
  ice: {
    title: "The frozen Fen",
    once: "game",
    text: () => "The Fen is frozen hard; the column could cross on the ice instead of going round by the bridges.",
    choices: () => [
      { label: "Cross on the ice", cost: `about 2 days saved; ${pct(R.ICE_RISK)}%: the ice breaks, −${pct(R.ICE_LOSS)}% horses` },
      { label: "Go round by the bridges", cost: "nothing" },
    ],
    apply: (s, ev, choice) => {
      const c = s.columns[ev.column];
      if (choice === 1) {
        log(s, `${c.name} goes round by the bridges.`);
        return;
      }
      const km = jumpAhead(s, c, R.ICE_KM);
      if (random(s) < R.ICE_RISK) {
        const lost = Math.round(c.horses * R.ICE_LOSS);
        c.horses = Math.max(0, c.horses - lost);
        log(s, `${c.name} crosses the frozen Fen, ${fmt(km)} km on, but the ice breaks under part of the herd: ${fmt(lost)} horses are lost.`, "warning");
        return;
      }
      log(s, `${c.name} crosses the frozen Fen on the ice, ${fmt(km)} km on.`);
    },
  },
};

export const isEventId = (v: unknown): v is EventId => typeof v === "string" && v in EVENTS;

/** Raises an event about a column at a place. False if one is already waiting or this one has been raised before. */
export function raiseEvent(s: GameState, id: EventId, ci: number, site: string): boolean {
  if (s.event) return false;
  const def = EVENTS[id];
  const key = def.once === "game" ? id : `${id}@${site}`;
  if (s.eventsDone.includes(key)) return false;
  const ev: PendingEvent = { id, column: ci, site, hour: s.hour };
  s.event = ev;
  s.eventsDone.push(key);
  log(s, `${def.title}: ${def.text(s, ev)}`, "alert");
  return true;
}

/** What the event waiting for an answer looks like to the interface, or null if there is none. */
export function eventView(s: GameState): { title: string; text: string; choices: EventChoice[] } | null {
  const ev = s.event;
  if (!ev) return null;
  const def = EVENTS[ev.id];
  return { title: def.title, text: def.text(s, ev), choices: def.choices(s, ev) };
}

/** The last choice of the event waiting, the one that changes the least: what happens if nobody chooses. */
export function lastChoice(s: GameState): number {
  const ev = s.event!;
  return EVENTS[ev.id].choices(s, ev).length - 1;
}

/** Answers the event waiting with one of its choices. False if there is none, or the choice is out of range. */
export function chooseEvent(s: GameState, choice: number): boolean {
  const ev = s.event;
  if (!ev) return false;
  const def = EVENTS[ev.id];
  if (choice < 0 || choice >= def.choices(s, ev).length) return false;
  s.event = null;
  def.apply(s, ev, choice);
  return true;
}

/** True if a farmer here would guide the column by a hidden path: a friendly people, and a mountain or a pass ahead. */
function guideOffered(s: GameState, c: Column): boolean {
  if (!c.at || c.route.length === 0) return false;
  const link = linkBetween(graph, c.at, c.route[0]);
  if (!link || (link.kind !== "mountain" && link.kind !== "pass")) return false;
  return population(graph.site(c.at)) > 0 && s.sites[c.at].hostility < R.GUIDES_HOSTILITY;
}

/** True in the months of ice: December, January and February. */
const isIceSeason = (s: GameState) => [11, 0, 1].includes(dateOf(s).month);

/** Raises the Khitan deserters right after a Mongol win, within a day of the battle. */
function raiseDeserters(s: GameState): boolean {
  const b = s.lastBattle;
  if (!b || s.hour - b.hour >= 24) return false;
  if (b.result.outcome !== "rout" && b.result.outcome !== "victory") return false;
  const ci = s.columns.findIndex(c => c.name === b.column);
  return ci >= 0 && s.columns[ci].men > 0 && raiseEvent(s, "deserters", ci, b.site);
}

/** Once an hour: raises the events that follow from where the columns are. */
export function checkEvents(s: GameState) {
  // the frost comes in November, on the mountain camps
  if (dateOf(s).month === 10) {
    for (const [ci, c] of s.columns.entries()) {
      if (c.men > 0 && c.at && graph.site(c.at).terrain === "mountain" && raiseEvent(s, "frost", ci, c.at)) return;
    }
  }
  // a beaten enemy's horsemen may offer to serve, within a day of the battle
  if (raiseDeserters(s)) return;
  for (const [ci, c] of s.columns.entries()) {
    if (c.men <= 0 || !c.at || c.route.length === 0) continue;
    // a farmer offers to guide the column by a hidden path through the mountains
    if (guideOffered(s, c) && raiseEvent(s, "guides", ci, c.at)) return;
    // the Fen is frozen: the column can cross on the ice instead of going round by the bridges
    if (isIceSeason(s) && R.ICE_SITES.includes(c.at) && raiseEvent(s, "ice", ci, c.at)) return;
  }
}
