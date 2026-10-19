// War aims and the khan's orders (layer 2): what the campaign is for, and the letters that
// shape it. One order is current at a time: its aim is the decisive one, and it has to be
// fulfilled by the day the khan gives. The honours are judged when the campaign is over.
//
// The aims read the state of the game and never change it: the game asks goals.ts whether
// the order is fulfilled, and the interface asks it how each aim stands.

import { daysBetween, formatDate, type GameDate } from "./calendar";
import * as R from "./constants";
import { log } from "./journal";
import { SCENARIO } from "./scenario";
import type { GameState } from "./game";

export type AimId = "capital" | "army" | "south" | "hold" | "roster" | "horses";

export interface Aim {
  id: AimId;
  /** what the aim is called */
  name: string;
  /** what the aim asks of the player */
  desc: string;
  /** the aim is one of the khan's orders: it decides the campaign while it is the current one */
  decisive: boolean;
  /** the aim is judged when the campaign is over, not as the campaign goes */
  atEnd: boolean;
  /** true when the aim is met */
  met: (s: GameState) => boolean;
  /** how the aim stands, in a few words */
  status: (s: GameState) => string;
}

/** A letter from the khan: an aim, a day by which it must be fulfilled, and the letter itself. */
export interface Dispatch {
  /** the aim this order asks for */
  aim: AimId;
  /** the day the order must be fulfilled by */
  deadline: GameDate;
  /** the title of the letter */
  title: string;
  /** the text of the letter */
  letter: string;
}

const cityName = (id: string) => SCENARIO.graph.site(id).name;
const citiesTaken = (s: GameState) => Object.values(s.cities).filter(c => c.taken).length;
const menInField = (s: GameState) => s.columns.reduce((n, c) => n + c.men, 0);
const horsesInField = (s: GameState) => s.columns.reduce((n, c) => n + c.horses, 0);
const armiesBroken = (s: GameState) => s.wins;

export const AIMS: readonly Aim[] = [
  {
    id: "capital",
    name: `Take ${cityName(SCENARIO.objective)}`,
    desc: "The Jin's northern city must fall before the thaw. It is the first order of the campaign.",
    decisive: true,
    atEnd: false,
    met: s => !!s.cities[SCENARIO.objective]?.taken,
    status: s => {
      const city = s.cities[SCENARIO.objective];
      if (!city) return "no news of it";
      if (city.taken) return "fallen";
      if (city.progress > 0) return `besieged, ${Math.floor(city.progress)}%`;
      return "still standing";
    },
  },
  {
    id: "army",
    name: "Break a Jin army in the open",
    desc: "The army that relieved the city will come north to take back what was won. Break it, or it breaks you.",
    decisive: true,
    atEnd: false,
    met: s => armiesBroken(s) > 0,
    status: s => (armiesBroken(s) > 0 ? `${armiesBroken(s)} ${armiesBroken(s) === 1 ? "army" : "armies"} broken` : "no army broken yet"),
  },
  {
    id: "south",
    name: `Take ${cityName("fenzhou")}`,
    desc: "One Jin city stands between the Mongols and the south. It falls, or the Jin will take back what they have lost.",
    decisive: true,
    atEnd: false,
    met: s => !!s.cities.fenzhou?.taken,
    status: s => {
      const city = s.cities.fenzhou;
      if (!city) return "no news of it";
      if (city.taken) return "fallen";
      if (city.progress > 0) return `besieged, ${Math.floor(city.progress)}%`;
      return "still standing";
    },
  },
  {
    id: "hold",
    name: `Hold ${R.AIM_HOLD} cities to the end`,
    desc: "Ground won and then lost is ground won for the Jin. Keep what the Mongols have taken.",
    decisive: false,
    atEnd: true,
    met: s => citiesTaken(s) >= R.AIM_HOLD,
    status: s => `${citiesTaken(s)} ${citiesTaken(s) === 1 ? "city" : "cities"} in Mongol hands`,
  },
  {
    id: "roster",
    name: `End with ${R.AIM_ROSTER.toLocaleString("en")} men in the field`,
    desc: "A campaign won with an army that no longer exists is a campaign lost.",
    decisive: false,
    atEnd: true,
    met: s => menInField(s) >= R.AIM_ROSTER,
    status: s => `${Math.round(menInField(s)).toLocaleString("en")} men now`,
  },
  {
    id: "horses",
    name: `End with ${R.AIM_HORSES_PER_MAN} horses for every man`,
    desc: "A column whose horses are gone is a column of footmen in a steppe war.",
    decisive: false,
    atEnd: true,
    met: s => {
      const men = menInField(s);
      return men > 0 && horsesInField(s) / men >= R.AIM_HORSES_PER_MAN;
    },
    status: s => {
      const men = menInField(s);
      return men > 0 ? `${(horsesInField(s) / men).toFixed(1)} horses for every man` : "no men left";
    },
  },
];

/** The letters of the khan, in the order they come. The last one is due at the thaw. */
export const DISPATCHES: readonly Dispatch[] = [
  {
    aim: "capital",
    deadline: { year: 1218, month: 11, day: 31, hour: 0 },
    title: "The first letter",
    letter: `Muqali, the city in the north is yours to take: ${cityName(SCENARIO.objective)}, where the Jin keep their northern court. `
      + "Take it before the winter is out and the campaign in Shanxi is won. Feed the horses on the way: the roads are long and the grass is thin.",
  },
  {
    aim: "army",
    deadline: { year: 1219, month: 1, day: 28, hour: 0 },
    title: "The second letter",
    letter: "The Jin will come north now that their city is gone, and they will take back what you have won unless you break them. "
      + "Break a Jin army in the open, Muqali, and the country behind you will stay quiet. The thaw is in March: you have until then.",
  },
  {
    aim: "south",
    deadline: { year: 1219, month: 2, day: 31, hour: 0 },
    title: "The third letter",
    letter: `One Jin city stands between you and their southern court: ${cityName("fenzhou")}, in the mountains past Huozhou. `
      + "Take it, and the Jin in Shanxi will have nowhere left to gather. The grass will be poor before the thaw: take the city while you can.",
  },
];

/** The hour by which an order must be fulfilled. */
export const deadlineHour = (d: Dispatch) => daysBetween(SCENARIO.start, d.deadline) * 24;

/** The order the khan is waiting for, if there is one left. */
export function currentDispatch(s: GameState): Dispatch | null {
  return s.dispatch < DISPATCHES.length ? DISPATCHES[s.dispatch] : null;
}

/** The aim of the order the khan is waiting for. */
export function currentAim(s: GameState): Aim | null {
  const d = currentDispatch(s);
  return d ? AIMS.find(a => a.id === d.aim) ?? null : null;
}

/** True when the order the khan is waiting for is fulfilled. */
export function dispatchMet(s: GameState): boolean {
  const aim = currentAim(s);
  return !!aim && aim.met(s);
}

/** True when the aim is met. An aim judged at the end counts only when the campaign is over. */
export function aimMet(s: GameState, aim: Aim, final = s.over): boolean {
  if (aim.atEnd && !final) return false;
  return aim.met(s);
}

/** The days left for the order the khan is waiting for, and the day it is due. */
export function dispatchTime(s: GameState): { left: number; due: string } {
  const d = currentDispatch(s);
  if (!d) return { left: 0, due: "no more orders" };
  const hour = deadlineHour(d);
  return { left: Math.max(0, Math.ceil((hour - s.hour) / 24)), due: formatDate(d.deadline) };
}

/** The khan's favour, in words. */
export function favourText(s: GameState): string {
  if (s.favour < R.FAVOUR_LOW) return "the khan is beside himself with anger";
  if (s.favour < R.FAVOUR_PARDON) return "the khan is not pleased";
  if (s.favour < R.FAVOUR_CONTENT) return "the khan is content enough";
  return "the khan is well satisfied";
}

/** Once an hour: the khan's orders are looked at: one fulfilled, one missed, the next letter comes. */
export function checkDispatches(s: GameState) {
  const d = currentDispatch(s);
  if (!d) return;
  const aim = AIMS.find(a => a.id === d.aim)!;
  if (aim.met(s)) fulfil(s, aim);
  else if (s.hour >= deadlineHour(d)) miss(s);
}

/** The order is done: the khan is pleased, and the next letter comes. */
function fulfil(s: GameState, aim: Aim) {
  s.favour = Math.min(100, s.favour + R.FAVOUR_FULFILLED);
  s.dispatchesMet += 1;
  log(s, `The khan's order is fulfilled: ${aim.name.toLowerCase()}. A rider brings the khan's thanks, and ${favourText(s)}.`, "arrival");
  s.dispatch += 1;
  if (!currentDispatch(s)) {
    s.result = "victory";
    s.over = true;
    log(s, `Victory: the last order of the campaign is fulfilled. The war in Shanxi is won.`, "arrival");
    return;
  }
  giveNextLetter(s);
}

/** The order is missed: the khan is angry, and the next letter comes anyway. */
function miss(s: GameState) {
  const d = currentDispatch(s)!;
  const aim = AIMS.find(a => a.id === d.aim)!;
  s.favour -= R.FAVOUR_MISSED;
  s.dispatchesMissed += 1;
  log(s, `The khan's order is not fulfilled in time: ${aim.name.toLowerCase()}. The khan is angry, and ${favourText(s)}.`, "alert");
  s.dispatch += 1;
  if (s.favour < 0) {
    s.result = "defeat";
    s.over = true;
    log(s, "Defeat: the khan's patience is over, and the noyan is called back to the steppe.", "alert");
    return;
  }
  giveNextLetter(s);
}

/** The next letter of the khan reaches the column. */
function giveNextLetter(s: GameState) {
  const d = currentDispatch(s);
  if (!d) return;
  const aim = AIMS.find(a => a.id === d.aim)!;
  log(s, `A letter from the khan. ${d.title}: ${d.letter} The order must be done by ${formatDate(d.deadline)}.`, "arrival");
  log(s, `New order: ${aim.name}. ${aim.desc}`, "arrival");
}
