// The noyans of the playtests: scripted players that play a whole campaign on their own.
// A policy gives orders once a day, and answers the threats and events once an hour, the way
// a player who looks at the game every day would. Policies only use the order functions,
// like the interface: they never write the state.

import { forageBlock, orderForage } from "../country";
import { orderSack } from "../booty";
import { orderSplit } from "../columns";
import { chooseEvent, eventView } from "../events";
import { objectiveOf } from "../goals";
import {
  battleInput, battleOdds, canAttack, foodDays, orderAttack, orderFight, orderMarch, orderRefuse,
  orderSiege, orderStorm, orderSurrender, stormFails, wallsOf, type GameState,
} from "../game";

/** What a policy remembers from one day to the next. */
export interface PolicyMemory {
  /** the place the main column was last sent to */
  target: string | null;
  /** days the main column has been besieging the objective */
  stall: number;
}

export interface Policy {
  id: string;
  /** one line on how this noyan plays */
  desc: string;
  /** orders given at the start of each day */
  day(s: GameState, mem: PolicyMemory): void;
  /** answers given after each hour: threats, events, attacks of opportunity */
  hour(s: GameState): void;
}

export const newMemory = (): PolicyMemory => ({ target: null, stall: 0 });

/** The reinforcements join the main column; the watches left behind stay in the towns they guard. */
function gather(s: GameState) {
  const c = s.columns[0];
  for (const [i, x] of s.columns.entries()) {
    if (i === 0 || x.name.includes("detachment")) continue;
    if (x.at && c.at && x.at !== c.at) orderMarch(s, i, c.at);
  }
}

/** Goes for the place the khan asks for: march there, besiege it, storm it after a long stand. */
function pursueObjective(s: GameState, mem: PolicyMemory, obj: string) {
  const c = s.columns[0];
  if (c.at !== obj) {
    if (mem.target !== obj) { orderMarch(s, 0, obj); mem.target = obj; }
    mem.stall = 0;
  } else if (!c.siege) {
    orderSiege(s, 0);
    mem.stall = 0;
  } else {
    mem.stall += 1;
    if (mem.stall > 45 && !stormFails(c, s.cities[obj])) orderStorm(s, 0);
  }
}

/** Answers the army that is upon the column: always fight, or fight only with the odds. */
function answerThreat(s: GameState, bold: boolean) {
  const t = s.threat;
  if (!t) return;
  const c = s.columns[t.column], a = s.jin[t.army];
  if (t.kind === "call") {
    // the Jin call on a town: hold the walls if the odds are good, give the town up if not
    const odds = battleOdds(battleInput(s, c, a, 0, wallsOf(s, t.site))).even.outcome;
    if (bold || ["defeat", "disaster"].includes(odds)) orderSurrender(s);
    else orderFight(s);
    return;
  }
  const odds = battleOdds(battleInput(s, c, a)).even.outcome;
  if (bold || ["rout", "victory", "draw"].includes(odds)) orderFight(s);
  else orderRefuse(s);
}

/** Goes straight for what the khan asks, eats what it finds and fights every battle. */
const direct: Policy = {
  id: "direct",
  desc: "marches straight at each order of the khan, never forages, fights every battle",
  day(s, mem) {
    gather(s);
    const obj = objectiveOf(s);
    if (s.columns[0].men > 0 && obj) pursueObjective(s, mem, obj);
  },
  hour(s) { answerThreat(s, true); },
};

/** Forages, sacks the towns it takes, chooses its battles by the odds, hunts the Jin when idle. */
const careful: Policy = {
  id: "careful",
  desc: "forages when food runs low, sacks and garrisons towns, fights only with good odds",
  day(s, mem) {
    gather(s);
    const c = s.columns[0];
    // a careful noyan leaves a watch in the towns he takes: the Jin call on them
    if (c.at && s.cities[c.at]?.taken) {
      const here = s.columns.filter(x => x.at === c.at);
      const watch = here.some(x => x.name.includes("detachment"));
      const total = here.reduce((n, x) => n + x.men, 0);
      if (!watch && total >= 2500) {
        const strongest = here.sort((a, b) => b.men - a.men)[0];
        orderSplit(s, s.columns.indexOf(strongest), 1000);
      }
    }
    if (c.men <= 0) return;
    const obj = objectiveOf(s);
    const hungry = foodDays(c) < 30 && c.at && !c.foraging && !forageBlock(s, c, "requisition");
    if (hungry) {
      orderForage(s, 0, "requisition");
    } else if (!obj) {
      // no place to take: hunt the Jin armies
      const foe = s.jin.filter(a => a.foot + a.horse > 0).sort((a, b) => b.foot + b.horse - a.foot - a.horse)[0];
      if (foe?.at && c.at !== foe.at) { orderMarch(s, 0, foe.at); mem.target = foe.at; }
    } else {
      pursueObjective(s, mem, obj);
    }
    // the goods of a town taken are worth the horses they buy
    if (c.at && s.cities[c.at]?.taken && !s.cities[c.at].sacked) orderSack(s, 0);
  },
  hour(s) {
    answerThreat(s, false);
    // a Jin army standing with the column is attacked when the odds are good
    const c = s.columns[0];
    const foe = c ? canAttack(s, 0) : null;
    if (c && foe && ["rout", "victory"].includes(battleOdds(battleInput(s, c, foe)).even.outcome)) orderAttack(s, 0);
  },
};

/** Gives no orders at all: the baseline of a player who walked away. */
const idle: Policy = {
  id: "idle",
  desc: "gives no orders; threats and events take their default answer",
  day() {},
  hour(s) { if (s.threat) orderRefuse(s); },
};

/** Like careful, but takes the first choice it can of every event: the bold one. */
const eager: Policy = {
  id: "eager",
  desc: "plays like careful, but takes the first choice of every event",
  day: careful.day,
  hour(s) {
    const first = eventView(s)?.choices.findIndex(c => !c.disabled) ?? -1;
    if (first >= 0) chooseEvent(s, first);
    careful.hour(s);
  },
};

export const POLICIES: Record<string, Policy> = { direct, careful, idle, eager };
