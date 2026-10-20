// The text of a playtest: a whole campaign in a few dozen lines, written to be read by a
// person or by an agent with as few words as possible. Numbers are rounded, the journal is
// cut down to the lines that pause the game, and repeated lines are counted, not repeated.

import type { LogEntry } from "../journal";
import type { DaySample, RunRecord } from "./run";

export interface DigestOptions {
  /** a timeline row every this many days; 0 leaves the timeline out */
  every?: number;
  /** "key": arrivals and alerts · "all": every journal line · "none" */
  log?: "key" | "all" | "none";
  /** journal lines are cut to this many characters; 0 keeps them whole */
  width?: number;
  /** print a repeated piece of news once, with a count (default true) */
  fold?: boolean;
}

const k = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 1000)}k` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

export function cut(text: string, width: number): string {
  return width > 0 && text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

/** A journal line with its numbers taken out: lines that differ only in numbers are the same news. */
const template = (text: string) => text.replace(/\d[\d,.]*/g, "#");

/**
 * Journal lines as "d<day> text". With `fold`, a line that only repeats earlier news with other
 * numbers is not printed again: the first one says how many times it came, and the last day.
 */
export function journalLines(log: LogEntry[], mode: "key" | "all", width: number, fold = true): string[] {
  const kept = log.filter(l => mode === "all" || l.kind === "arrival" || l.kind === "alert");
  const groups = new Map<string, { index: number; count: number; last: number }>();
  const out: string[] = [];
  for (const l of kept) {
    const key = fold ? template(l.text) : `${out.length}`;
    const day = Math.floor(l.hour / 24);
    const g = groups.get(key);
    if (g) { g.count++; g.last = day; continue; }
    groups.set(key, { index: out.length, count: 1, last: day });
    out.push(`d${day} ${l.kind === "alert" ? "! " : ""}${cut(l.text, width)}`);
  }
  for (const g of groups.values()) if (g.count > 1) out[g.index] += ` [x${g.count}, last d${g.last}]`;
  return out;
}

const TIMELINE_HEAD = "day date       where              men horses sheep cond tir mor food fav  gold towns jin";

export function timelineRow(x: DaySample): string {
  return [
    String(x.day).padStart(3), x.date, x.where.slice(0, 16).padEnd(16), k(x.men).padStart(6), k(x.horses).padStart(6), k(x.sheep).padStart(5),
    String(x.condition).padStart(4), String(x.fatigue).padStart(3), String(x.morale).padStart(3), String(x.food).padStart(4),
    String(x.favour).padStart(3), k(x.treasury).padStart(5), String(x.towns).padStart(5), k(x.jinMen).padStart(5),
  ].join(" ");
}

/** The lowest point of a value over the campaign, and when it came. */
function low(samples: DaySample[], key: keyof DaySample): string {
  let best = samples[0];
  for (const x of samples) if ((x[key] as number) < (best[key] as number)) best = x;
  return `${key} ${best[key]} (d${best.day})`;
}

/** The longest run of days with nothing put to the player: no threat, no event, no alert. */
export function longestQuiet(r: RunRecord): { days: number; from: number } {
  const days = new Set<number>(r.decisions.map(d => d.day));
  for (const l of r.final.log) if (l.kind === "alert" || l.kind === "arrival") days.add(Math.floor(l.hour / 24));
  const last = Math.floor(r.final.hour / 24);
  let best = { days: 0, from: 0 }, from = 0;
  for (let d = 0; d <= last; d++) {
    if (days.has(d) || d === last) {
      if (d - from > best.days) best = { days: d - from, from };
      from = d + 1;
    }
  }
  return best;
}

/** One line: how the campaign ended. Also the row of a batch. */
export function outcomeLine(r: RunRecord): string {
  const s = r.final, end = r.samples.at(-1)!;
  const result = s.result ?? (s.over ? "over" : "unfinished");
  const orders = s.dispatchResults.map(x => (x === "met" ? "+" : "-")).join("") || "none";
  return `${r.policy} seed=${r.seed} sheep=${r.sheep}: ${result.toUpperCase()} d${end.day} ${end.date}`
    + ` | orders ${orders} | favour ${end.favour} | men ${k(end.men)} horses ${k(end.horses)} | towns ${end.towns}`
    + ` | battles ${r.battles.length} decisions ${r.decisions.length}${r.problems.length ? ` | PROBLEMS ${r.problems.length}` : ""}`;
}

/** The whole campaign, compact. */
export function formatRun(r: RunRecord, opts: DigestOptions = {}): string {
  const every = opts.every ?? 10, mode = opts.log ?? "key", width = opts.width ?? 100;
  const out: string[] = [outcomeLine(r)];
  out.push(`lows: ${(["men", "horses", "condition", "morale", "food", "favour"] as const).map(key => low(r.samples, key)).join(", ")}`);
  const quiet = longestQuiet(r);
  const kinds: Record<string, number> = {};
  for (const d of r.decisions) kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
  out.push(`pacing: ${r.decisions.length} decisions (${Object.entries(kinds).map(([a, n]) => `${a} ${n}`).join(", ") || "none"}); longest quiet stretch ${quiet.days} days from d${quiet.from}`);
  if (r.problems.length) out.push("PROBLEMS:", ...r.problems.slice(0, 10).map(p => `  ${p}`), ...(r.problems.length > 10 ? [`  ... ${r.problems.length - 10} more`] : []));
  if (r.battles.length) {
    out.push("battles:");
    for (const b of r.battles) {
      out.push(`  d${b.day} ${b.site}: ${b.column} vs ${b.army} (${b.attacker} attacks) ${b.outcome} x${b.ratio}, lost ${k(b.mongolLost)} / ${k(b.jinLost)}`);
    }
  }
  if (every > 0) {
    out.push(`timeline (every ${every} days; where* = besieging; cond/tir(ed)/mor(ale)/food(days) are the first column's):`, TIMELINE_HEAD);
    for (const x of r.samples) if (x.day % every === 0 || x === r.samples.at(-1)) out.push(timelineRow(x));
  }
  if (mode !== "none") {
    out.push(`journal (${mode === "key" ? "arrivals and alerts" : "all lines"}; ! = alert; repeated news printed once with [xN, last day]):`);
    out.push(...journalLines(r.final.log, mode, width, opts.fold ?? true));
  }
  return out.join("\n");
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Many campaigns, one line each, and what they add up to for each policy. */
export function formatBatch(runs: RunRecord[]): string {
  const out: string[] = runs.map(outcomeLine);
  const byPolicy = new Map<string, RunRecord[]>();
  for (const r of runs) byPolicy.set(r.policy, [...(byPolicy.get(r.policy) ?? []), r]);
  out.push("summary:");
  for (const [p, rs] of byPolicy) {
    const wins = rs.filter(r => r.final.result === "victory").length;
    const ends = rs.map(r => r.samples.at(-1)!);
    const days = ends.map(e => e.day).sort((a, b) => a - b);
    out.push(`  ${p}: won ${wins}/${rs.length}, day ${days[0]}-${days.at(-1)} (mean ${Math.round(mean(days))})`
      + `, orders met ${mean(rs.map(r => r.final.dispatchesMet)).toFixed(1)}, favour ${Math.round(mean(ends.map(e => e.favour)))}`
      + `, men ${k(mean(ends.map(e => e.men)))}, battles ${mean(rs.map(r => r.battles.length)).toFixed(1)}`
      + `, problems ${rs.reduce((n, r) => n + r.problems.length, 0)}`);
  }
  return out.join("\n");
}
