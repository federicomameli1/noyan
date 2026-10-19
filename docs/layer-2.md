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

## 5. What the playtest found

The campaign is played to the end by a noyan with a policy (`src/sim/campaign.test.ts`),
and the first runs showed what was wrong with the design as it was first written.

- **The Jin armies were starving, and the war was no war.** The wagon convoys moved at
  15 km a day while the armies they fed moved at 20: an army in the field could never
  be fed, and every Jin army died of hunger within a month. The convoys now move at
  24 km a day, enough to keep up, and the Jin can put their weight into the war.
- **The second order was fulfilled the moment it was given.** The khan asks for a Jin
  army to be broken; the column had already broken one before the letter came. The
  armies broken before an order count for nothing: the order wants a *new* army
  broken.
- **The column was starving, not fighting.** Three orders mean three sieges, and a
  siege is a long stand with the grass eaten around the camp. The towns now feed a
  column for 45 days instead of 30, and the war is won by the noyan who forages on
  the way, sacks the towns he takes and brings the sheep.
- **The villages' theft was a slow poison.** Villagers at hostility above 70 stole
  0.2% of the herd every night, which in a long siege took the horses faster than
  the grass could feed them. Now they take half as much.
- **A column that no longer exists kept playing.** A column of one man still laid
  sieges and was still attacked. A column with fewer than a thousand men cannot
  besiege a city any more, and a column of a few dozen men is not worth attacking.

With those fixed, the careful noyan wins the campaign on day 126 with a town in his
hands and a khan well satisfied, and the noyan who only marches and fights loses it
at the thaw. Both results are in the tests.

### What a second playtest found

- **A call on a town could be lost.** Two Jin armies reaching two towns in the same
  hour lost one of the calls: the first threat was waiting and the second was
  dropped, and that town was never taken. A call is now a standing order, looked
  at every hour: the army asks again until the player answers.
- **A save made during a call could not be read.** The save validator knew about
  the two kinds of threat of layer 1 and not the third, so the autosave of that
  day was refused, the Continue button on the title screen disappeared, and an
  exported file could not be imported.
- **A town left without a garrison was in nobody's hands.** The Jin took a town
  back only when they had been sent to call on it: a column that rode away before
  the army arrived left the town with the Jin standing in it.
- **The report of the campaign said the opposite of what happened.** The end of
  the campaign said which orders had been fulfilled by counting them, and a
  count is not a list: an order missed was reported as fulfilled. What became of
  each order is now kept in the state, one entry per order.
- **An order was judged a day early.** The orders were due on a day and were
  lost at midnight of that day, while the top bar still said the day was due.
- **The walls of a city were the walls of its kind.** Taiyuan has walls of its
  own, and the defence was worth less than the city card said.
- **The herds of the Mongols were out of reach.** The Jin horsemen heard of a
  flock within sixty kilometres, and the pastures of the Mongols are three
  hundred away: the raid on the remount herds never happened at all.
- **A watch of a thousand men cannot hold a walled city.** The careful noyan
  leaves a watch in the town he has taken, and the Jin take it back: the ground
  won is the ground kept, and keeping it costs an army of its own.

## 6. What this needs in the code

- `src/sim/goals.ts`: the dispatches, the favour, the order in which they are fulfilled.
- `src/sim/game.ts`: the state (the current dispatch, the favour), the town changing
  hands, the battle at the walls.
- `src/sim/battle.ts`: the walls on the side that defends.
- `src/sim/jin.ts`: the new orders of the Jin, the call on the town, the raid on the
  herders.
- `src/sim/events.ts`: the Jin calling on a town is an event with two answers.
- `src/main.ts`: the letters, the favour, the new buttons.
- `src/sim/campaign.test.ts`: the whole campaign, played with different policies.

## 7. How it will be tried out

- The campaign test plays the whole campaign with two policies: the one that only
  marches and fights, and the one that forages, sacks the towns and chooses its
  battles by the odds. The careful one must win, the other must lose, and neither
  may crash.
- The balance is read from those runs: the deadlines and the numbers of the Jin
  reserves are the numbers to tune.
- Every new rule has a test of its own, and the save validator has to know the new
  state.

## 8. What is left for the layer 3

The war is now two-way, but it is still fought in one region, with one army and one
road. The next step, when there is time for it, is a second region: the march on
Zhongdu in 1219, with the map of its own, the roads south of the Taiyuan basin and
the Jin court at the end of them. The pre-projected geography is already there for
the whole of northern China, so what it needs is a new graph of places and links, a
new scenario and a new balance: a layer of its own, not an extension of this one.
