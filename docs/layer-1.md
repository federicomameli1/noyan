# Layer 1: the war

The rules of the war, in prose. Every number here lives in `src/sim/constants.ts`,
tagged [D] documented, [R] modern estimate, [S] game estimate. This file explains
*what* the numbers do; the code explains *how*.

## The aim of the campaign

The campaign is won by taking Taiyuan, the Jin's northern city, before the spring
thaw (31 March 1219). Around that one aim there are honours, judged when the
campaign is over: three Jin towns taken, a Jin army broken in the open, two
thousand men still in the field, two horses for every man.

The decisive aim is the only one that ends the war. It is always in sight in the
top bar; the others are in the campaign panel, under the saves.

## The Jin armies

The Jin field more than one kind of army.

- A **field army** marches to relieve a city that has been besieged for a number
  of days, or as soon as another city of theirs falls. While it holds the city the
  siege makes no headway: the column has to storm the walls, or lift the siege and
  wait. A relief army that reaches the city brings twenty days of food with it.
- The **frontier horse** are raiders: they do not wait for a column, they keep out
  of its reach, and they go after the flocks left behind without a column to guard
  them.

An army that judges itself clearly stronger than a column within reach sets out to
attack it. The player then chooses: stand and fight, or ride away at a forced
march, leaving the sheep behind and the siege lifted.

**Sight.** What the Mongols know of an army depends on the distance: from more
than 120 km there is an army and its size band, from 60 km its place and its
numbers, from 30 km everything, foot and horse and spirit and where it is going.
Scouts on exhausted horses see half as far. The player fights with what the scouts
know, not with what is true.

**Supply.** A field army in the field eats one day's food a day. Every five days
a wagon convoy leaves its home town with ten days of food and follows the army at
fifteen kilometres a day. A column standing on the road stops the wagons and falls
on them: the column takes rations (no more than it can carry) and grain for the
horses, and the army goes hungry. A hungry army loses spirit and men every day,
and goes home when its spirit breaks.

**The war effort.** As the campaign goes on the dynasty sends more armies from the
south: a reserve army on 26 September, a northern host on 5 November. The siege of
Taiyuan can be relieved more than once.

## Battles

A battle is decided by the strength of the two sides, and the strength of a side
is its men times what each of them is worth, times the factors of the day.

- A Mongol horseman is worth 1, a Jin horseman 0.7, a Jin footman 0.4.
- The horses decide: a fat herd is worth 1.1, a fit one 1, a thin one 0.75, an
  exhausted one 0.45; tired horses (fatigue over 60) lose a fifth more.
- The ground: horsemen want open land (1.2 on the steppe, the plain and the
  desert), footmen want broken land (1.4 in a pass, 1.2 in the mountains).
- The spirit of the men: the strength is multiplied by 0.5 plus the morale over
  100. A column starts at 70, a field army at 50 or 55.
- The walls of the city, when the Jin fight behind them.
- The luck of the day, drawn from the campaign's own dice: a factor between 0.9
  and 1.1 for each side.

The ratio of the two strengths picks the outcome, best for the Mongols first:

| ratio | outcome | the Mongols lose | the Jin lose |
|---|---|---|---|
| 2 or more | rout | 3% | 40%, plus 15% if the fugitives are ridden down |
| 1.25 or more | victory | 8% | 25%, plus 15% if pursued |
| 0.8 or more | draw | 12% | 12% |
| 0.5 or more | defeat | 25% | 8% |
| below | disaster | 45% | 3% |

An orderly retreat saves a third of the losses, if the horses can still run. Every
man lost costs two horses. A beaten army falls back; a beaten column lifts its
siege and stands where it is.

**The garrison.** A besieged city that judges itself clearly stronger outside the
walls sends half its garrison out: the walls no longer help it, and the sortie can
break a siege held by too few men. When a relief army reaches a besieged city, a
quarter of the garrison comes out to help it.

## The countryside

Every Jin place has villages around it: none on Mongol land, none in the passes
or on the pastures, one or two in the uplands, two or three on the plain, three
around a city. The villages hold food, grain and livestock.

- **Requisition** takes a day and a quarter of what they have, and earns 5 points
  of anger.
- **Plunder** takes two days and four fifths of everything, and the livestock
  with it; the fields are burned and nothing grows there before the next harvest.
  It earns 25 points of anger.

The anger spreads to half the neighbouring places and cools by a point a day. Above
50 the villagers hide their food and a requisition brings half; above 70 they steal
horses in the night. Sacking a town that has already fallen adds 15 points of
anger around it.

## The events

Things happen to a column, and each one is a choice with its cost written on the
button. While one waits for an answer, the interface stops time. The last choice
is the default: what happens if nobody chooses is the choice that changes the least,
so a game with no player never gets stuck.

| event | when | the choices |
|---|---|---|
| Tribute offered | before a place is plundered | take a third of the stores and calm the anger, or sack them anyway |
| Hard frost | November, on a mountain camp | rest a day by the fires, or march on and lose condition |
| Loose horses | after a battle won in the open | round them up, at the price of half a day and thin horses, or let them go |
| A guide offered | a mountain or a pass ahead, in friendly country | follow a hidden path that saves 40 km, or risk an ambush |
| Khitan deserters | a day after a battle won | take in 200 horsemen who are not trusted yet, or send them away |
| The frozen Fen | December to February, on the road down the Fen | cross the ice and save 60 km, or go round by the bridges |
| A merchant caravan | on a road, once in the campaign | buy food for goods, sell the sheep the column cannot use, or let them pass |
| A snowstorm | December to February, in a pass | push through and lose men and condition, or wait a day out |

## Booty and remounts

A battle costs two horses for every man lost, and nothing else on the map gives
horses back. A fallen town holds two goods for every man of its garrison. Sacking
it puts the goods in the treasury and makes the countryside around it angry.

The goods buy remounts from the khan's herds: twenty goods a horse, a thousand
horses at most in one call. The herds need ground the Mongols hold to graze on, so
the call can only be made at a place the Mongols hold, and the horses take three
days to come. They wait at the place they were called to, and the first column
there takes them.

## The columns

The khan sends reinforcements during the campaign, and a column standing at a
place can be divided: two columns, each with half the men, the horses and the food
of the whole, each with its own orders, its own pace and its own siege. A part
that goes away keeps at least a thousand men, or it is not an army.

Two columns standing at the same place can be joined again: one column with the
men, horses, food and grain of the two, and the spirit of the two averaged by the
men they have.
