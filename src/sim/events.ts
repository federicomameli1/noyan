// Events at places (layer 1): short texts that appear when something happens to a column, each with
// two choices whose cost is written on the button. While one waits for an answer the interface stops
// time. The LAST choice of each event is the default: what happens if nobody chooses, the one that
// changes the least, so a simulation with no player never gets stuck. Numbers in constants.ts.

import * as R from "./constants";
import { dateOf, log, type GameState, type PendingEvent } from "./game";
import { orderForage } from "./country";
import { SCENARIO } from "./scenario";

const graph = SCENARIO.graph;
const fmt = (n: number) => Math.round(n).toLocaleString("en");

export type EventId = "tribute" | "frost" | "herd";

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

/** Once an hour: raises the events that follow from where the columns are. Only frost, for now. */
export function checkEvents(s: GameState) {
  if (dateOf(s).month !== 10) return; // the frost comes in November
  for (const [ci, c] of s.columns.entries()) {
    if (c.men > 0 && c.at && graph.site(c.at).terrain === "mountain" && raiseEvent(s, "frost", ci, c.at)) return;
  }
}
