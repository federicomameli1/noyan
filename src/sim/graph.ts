// Movement graph: places (cities, passes, junctions) linked by roads, tracks and mountain paths.
// Columns move only along links. Lengths come from the coordinates.

import { LINKS, type LinkKind } from "./constants";
import type { Control, Terrain } from "./world";

export type SiteKind = "city" | "pass" | "junction" | "pasture";

export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  lon: number;
  lat: number;
  terrain: Terrain;
  control: Control;
  /** false for a dry camp (ridges, desert) */
  water: boolean;
}

export interface Link {
  a: string;
  b: string;
  kind: LinkKind;
  /** km along the link */
  km: number;
}

export interface Graph {
  sites: readonly Site[];
  links: readonly Link[];
  site(id: string): Site;
  /** links leaving a site, with the site at the other end */
  neighbours(id: string): readonly { link: Link; to: string }[];
}

const EARTH_RADIUS_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function buildGraph(sites: readonly Site[], links: readonly [string, string, LinkKind][]): Graph {
  const byId = new Map(sites.map(s => [s.id, s]));
  const site = (id: string) => {
    const s = byId.get(id);
    if (!s) throw new Error(`unknown site ${id}`);
    return s;
  };
  const adj = new Map<string, { link: Link; to: string }[]>(sites.map(s => [s.id, []]));
  const built = links.map(([a, b, kind]) => {
    const A = site(a), B = site(b);
    const link: Link = { a, b, kind, km: Math.round(distanceKm(A.lon, A.lat, B.lon, B.lat) * LINKS[kind].winding) };
    adj.get(a)!.push({ link, to: b });
    adj.get(b)!.push({ link, to: a });
    return link;
  });
  return { sites, links: built, site, neighbours: id => adj.get(id) ?? [] };
}

/** Hours-equivalent cost of a link: its length divided by its speed factor. */
export const linkCost = (l: Link) => l.km / LINKS[l.kind].speed;

/**
 * Fastest route from `from` to `to` as a list of site ids, both ends included. Null if unreachable.
 * `closed` sites (a fortress still holding out) can be the destination but cannot be crossed.
 */
export function findPath(g: Graph, from: string, to: string, closed: (id: string) => boolean = () => false): string[] | null {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    let cur = "", best = Infinity;
    for (const id of open) if (dist.get(id)! < best) { best = dist.get(id)!; cur = id; }
    open.delete(cur);
    if (cur === to) break;
    if (cur !== from && closed(cur)) continue;
    for (const { link, to: next } of g.neighbours(cur)) {
      const d = best + linkCost(link);
      if (d < (dist.get(next) ?? Infinity)) { dist.set(next, d); prev.set(next, cur); open.add(next); }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}

export function linkBetween(g: Graph, a: string, b: string): Link | undefined {
  return g.neighbours(a).find(n => n.to === b)?.link;
}
