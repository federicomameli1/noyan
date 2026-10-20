---
name: playtest
description: Play Noyan headless from the command line to test gameplay and balance - whole campaigns with scripted policies, batches over seeds, or turn-by-turn play as a player. Use after changing rules or numbers in src/sim, or when asked to playtest.
---

# Playtesting Noyan without a browser

The kit lives in `src/sim/playtest/` (pure TypeScript, like the rest of the simulation) and
is driven by `npm run playtest -- <command>` (`scripts/playtest.mjs`, Node, about 1 s per
call). Nothing it prints is a full state dump: every output is written to be short.

## Pick the cheapest tool for the question

| question | command | size of the output |
|---|---|---|
| did a change break or tip the balance? | `batch --seeds 10` | one line per run + one per policy |
| how does one campaign go? | `run --policy careful --log none` | ~30 lines |
| the story of a campaign | `run --policy careful` | ~100 lines |
| what does a player feel at each decision? | `new`, then `turn` repeatedly | ~10 lines per turn |

Start with `batch`. Go down the table only as far as the question needs.

## Whole campaigns

```sh
npm run playtest -- batch                         # every policy, seeds 1-10
npm run playtest -- batch --policy careful,direct --seeds 20 --sheep 3000
npm run playtest -- run --policy direct --seed 4 --every 20 --log none
npm run playtest -- run --policy careful --days 60   # stop early
npm run playtest -- policies                      # the scripted players
```

A digest says: the outcome (`orders +-+` = met, missed, met), the lows of men, horses,
condition, morale, food and favour with the day they came, the pacing (decisions put to
the player and the longest stretch with nothing to decide), every battle with its odds
ratio and losses, a timeline every N days, and the journal. The journal keeps only
arrivals and alerts (`--log all` for every line) and prints news repeated with other
numbers once, as `[x12, last d90]` (`--nofold` to see each one).

**PROBLEMS** lines are broken invariants (NaN, negative stocks, morale above 100, a
threat pointing at a missing army): always a bug, never balance.

## Turn by turn, as a player

```sh
npm run playtest -- new                           # .playtest/game.json (git-ignored); --sheep, --seed
npm run playtest -- turn --do "route 0 taiyuan" --days 0   # plan only, time does not run
npm run playtest -- turn --do "march 0 taiyuan"               # run until the player is needed
npm run playtest -- turn --do "choose 1"
npm run playtest -- turn --do "pace 0 forced; forage 1 requisition" --days 10
npm run playtest -- look                          # the situation again; --all shows the Jin as they are
npm run playtest -- map taiyuan                   # the roads out of a place
```

`turn` runs until something needs the player (a threat, an event, an arrival or an alert,
a column that stops marching or foraging, the end) or `--days` (30 by default), then prints
the new journal lines and the situation. It does not run while a Jin army waits for an
answer: give `fight`, `refuse` or `surrender` first, as the paused interface would force.
An event left unanswered takes its last choice, as in the game. The situation shows what
the player sees: the Jin only as the scouts report them, unless `look --all`.

Orders: `npm run playtest -- help`. Columns are numbered as `[0]`, `[1]` in the situation;
places are ids (`taiyuan`) or the start of a name.

## Reporting what you found

Separate the three kinds of finding: bugs (PROBLEMS, or a rule doing something the code
says it should not), balance (a policy that should win and loses, numbers that never
move), and experience (long quiet stretches, decisions with an obvious answer, the same
news ten times). Quote the line of the digest that shows it, not your impression.

## Adding a policy

A policy is a `day` and an `hour` function in `src/sim/playtest/policies.ts` that only
calls order functions, like the interface. Add it to `POLICIES`; `batch` and the tests
pick it up. The campaign test (`src/sim/campaign.test.ts`) asserts on `careful` and
`direct`: change their behaviour and you change that test.
