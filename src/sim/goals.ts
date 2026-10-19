// War aims (layer 1): what the campaign is for. One decisive aim ends the war when it is met;
// the others are honours, some judged as the campaign goes and some when it is over.
// Numbers in constants.ts.
//
// The aims read the state of the game and never change it: the game asks goals.ts whether the
// decisive aim is met, and the interface asks it how each aim stands.

import * as R from "./constants";
import { SCENARIO } from "./scenario";
import type { GameState } from "./game";

export interface Aim {
  id: string;
  /** what the aim is called */
  name: string;
  /** what the aim asks of the player */
  desc: string;
  /** the aim ends the campaign when it is met */
  decisive: boolean;
  /** the aim is judged when the campaign is over, not as the campaign goes */
  atEnd: boolean;
  /** true when the aim is met */
  met: (s: GameState) => boolean;
  /** how the aim stands, in a few words */
  status: (s: GameState) => string;
}

const cityName = (id: string) => SCENARIO.graph.site(id).name;
const citiesTaken = (s: GameState) => Object.values(s.cities).filter(c => c.taken).length;
const menInField = (s: GameState) => s.columns.reduce((n, c) => n + c.men, 0);
const horsesInField = (s: GameState) => s.columns.reduce((n, c) => n + c.horses, 0);

export const AIMS: readonly Aim[] = [
  {
    id: "capital",
    name: `Take ${cityName(SCENARIO.objective)}`,
    desc: "The Jin's northern city must fall before the spring thaw. This aim decides the campaign.",
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
    id: "cities",
    name: `Take ${R.AIM_CITIES} Jin cities`,
    desc: "The war is not won by one city: the country behind it has to be held as well.",
    decisive: false,
    atEnd: false,
    met: s => citiesTaken(s) >= R.AIM_CITIES,
    status: s => `${citiesTaken(s)} of ${R.AIM_CITIES} cities taken`,
  },
  {
    id: "rout",
    name: "Break a Jin army in the open",
    desc: "A field army beaten in the open gives up its supplies and its road.",
    decisive: false,
    atEnd: false,
    met: s => s.wins > 0,
    status: s => (s.wins > 0 ? `${s.wins} ${s.wins === 1 ? "army" : "armies"} broken` : "no army broken yet"),
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

/** The decisive aim, if it is met: the war is over. */
export function decisiveAimMet(s: GameState): Aim | null {
  return AIMS.find(a => a.decisive && a.met(s)) ?? null;
}

/** True when the aim is met. An aim judged at the end counts only when the campaign is over. */
export function aimMet(s: GameState, aim: Aim, final = s.over): boolean {
  if (aim.atEnd && !final) return false;
  return aim.met(s);
}
