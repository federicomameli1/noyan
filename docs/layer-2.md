# Layer 2: the war comes back

The brainstorming session, and what came out of it. Layer 0 is the logistics loop, layer 1
is the war: Jin armies, battles, plunder, the aims of the campaign. Layer 2 has to make the
*campaign* a war and not a march.

## 1. What the campaign is weak at now

After a campaign played to the end with a simple policy (see `src/sim/campaign.test.ts`),
the shape of the game is clear, and so are its weaknesses.

- **One aim, one city, one line.** The player takes Taiyuan. The other thirty-odd places
  on the map are scenery: the fastest way is the only way.
- **The war is one-directional.** The Mongols take towns; the Jin never take one back.
  A conquest is permanent, so nothing the player wins has to be defended.
- **The campaign ends at the first victory.** Taiyuan falls in late November in a straight
  line; the remaining four months of the calendar (until the thaw on 31 March) are unused.
- **The Jin are an obstacle, not an opponent.** Two armies and two reserves, all with the
  same orders: relieve Taiyuan. There is nothing to outmanoeuvre, only to outlast.
- **The failure is passive.** "Spring has come" is not a defeat anybody fights.
- **Nothing the player wins feeds back.** A taken town gives food, grain and booty once,
  and then it is a blue square on the map.

## 2. The candidates

**A. The khan's dispatches.** The khan sends letters with orders, each with a deadline.
Cheap: it reuses the aims of layer 1. It gives the campaign a shape and a judgement, but
the war stays one-directional.

**B. The Jin counter-offensive.** The Jin turn on the towns the Mongols hold: they call
on them, and a town with no garrison is lost. The war becomes two-way, the conquered
country matters, and the player has to choose between taking and keeping. This is the
biggest change, and the most valuable one.

**C. A second region.** The campaign continues to Zhongdu, as it did in 1219, on a new
map. The grandest step, and the most expensive: a new graph of places and links, a new
scenario, a new balance. The pre-projected geography is already there for the whole of
northern China, so the data is not the problem; the hand-built place graph and the
time are.

**D. Diplomacy.** The Xi Xia, the submitted peoples, the Jin court, the envoys. Rich and
historically the right texture for 1218, but slow and abstract: in a seven-month campaign
it would be a second, duller game next to the war.

**E. The horde.** The ord that follows the army, the khan's favour, the generals, the
families. It gives the game its Mongol identity, but it puts a second economy on top of
a first one that is already rich, and it risks muddying the logistics loop, which is the
best thing in the game.

**F. The weather.** The monsoon, the thaw, the great grass. Cheap and deepens the
logistics, but it is a parameter, not a layer.

## 3. What was chosen, and why

**B is the spine, A is the frame, F is the pressure.** C is deferred to layer 3, with the
reason written down: the second region needs a map of its own, and a half-built map is
worse than none. D and E wait: they are good, and they are not what the campaign needs
now.

So layer 2 is: **the campaign continues after the city falls, the war comes back at the
player, and the khan watches.**

- The campaign no longer ends when Taiyuan falls. The khan's dispatches give the war its
  shape: take the city, break the army that relieved it, take the last city in the
  mountains. Each order has a deadline.
- The Jin field army, freed from Taiyuan, turns north and calls on the towns the Mongols
  hold. A town with no garrison is lost; a town with one is defended at the walls.
- The khan's favour is the score: orders fulfilled earn it, deadlines missed and towns
  lost spend it. When it runs out, the khan calls the noyan back.

## 4. The rules

### The dispatches

A dispatch is a letter from the khan: an aim, a day by which it must be fulfilled, and
the text of the letter. The current dispatch's aim is the decisive one: the top bar
always shows it, with the days left.

| # | the order | the aim | by |
|---|---|---|---|
| 1 | The city in the north | Take Taiyuan | 31 December 1218 |
| 2 | The army that relieved it | Break a Jin army in the open | 28 February 1219 |
| 3 | The last city in the mountains | Take Fenzhou | 31 March 1219 (the thaw) |

An order fulfilled earns 10 of the khan's favour; an order missed spends 15 and the khan
sends the next letter anyway. Missing an order does not end the campaign on its own: the
favour is the buffer, and the campaign ends when the favour is gone, when the last
order is fulfilled, or at the thaw.

The honours, judged at the end, are unchanged in spirit: two thousand men still in the
field, two horses for every man, and now **hold two cities to the end**, which is the
point of layer 2.

### The Jin call on a town

When the city their army was to relieve has fallen, a Jin field army turns north: it
marches on the nearest town the Mongols hold.

- A town with no column in it is **taken back**: the goods are gone, the remounts waiting
  there are taken, the garrison is the half of the attacking army that stays, and the
  khan's favour falls by 10.
- A town with a column in it is **called on**: the player chooses to hold the walls or to
  give the town up. Holding the walls is a battle fought *behind the walls*, which
  multiply the strength of the defenders as they multiply the strength of a Jin army
  behind its own.

The raiders, meanwhile, take not only the flocks left behind but the sheep of the
allied herders: the remount herds are the Mongols' supply of horses, and they are in
reach of the enemy.

### The numbers

| number | value | why |
|---|---|---|
| favour at the start | 70 | a khan with a war in hand is not pleased, but not angry [S] |
| favour for an order fulfilled | 10 | enough to keep going after one failure [S] |
| favour for an order missed | 15 | a missed order is a disgrace [S] |
| favour for a town lost | 10 | the ground is worth more than an order [S] |
| favour below 0 | the campaign is over | the khan calls the noyan back [S] |
| the raiders take of the herders' sheep | half | the remount herds are worth a raid [S] |
| the Jin garrison left in a town taken back | half the army | enough to hold it, not to besiege it [S] |

## 5. What this needs in the code

- `src/sim/goals.ts`: the dispatches, the favour, the order in which they are fulfilled.
- `src/sim/game.ts`: the state (the current dispatch, the favour), the town changing
  hands, the battle at the walls.
- `src/sim/battle.ts`: the walls on the side that defends.
- `src/sim/jin.ts`: the new orders of the Jin, the call on the town, the raid on the
  herders.
- `src/sim/events.ts`: the Jin calling on a town is an event with two answers.
- `src/main.ts`: the letters, the favour, the new buttons.
- `src/sim/campaign.test.ts`: the whole campaign, played with different policies.

## 6. How it will be tried out

- The campaign test plays the whole campaign with three policies: straight to the city,
  cautious (forage before moving), and defensive (keep a garrison in the towns taken).
  Each has to end in a result, and none of them may crash.
- The balance is read from those runs: the dispatch deadlines are the numbers to tune.
- Every new rule has a test of its own, and the save validator has to know the new state.
