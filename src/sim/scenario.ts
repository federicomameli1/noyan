// Layer 0 scenario: northern Shanxi and western Hebei, autumn 1218.
// Muqali entered Shanxi in 1218 and took Taiyuan that autumn [D]. Coordinates of
// passes match the drawn map; other places use the modern town, approximately.

import type { GameDate } from "./calendar";
import type { CityType, LinkKind } from "./constants";
import { buildGraph, type Site, type SiteKind } from "./graph";
import type { Control, Terrain } from "./world";

type Row = [id: string, name: string, kind: SiteKind, lon: number, lat: number, terrain: Terrain, control: Control, water?: boolean];

const SITES: Row[] = [
  // Datong basin and the steppe edge to the north
  ["datong", "Datong", "city", 113.3, 40.09, "upland", "mongols"],
  ["fengzhou", "Fengzhou pastures", "pasture", 111.75, 40.75, "steppe", "mongols"],
  ["xijing-pastures", "Xijing pastures", "pasture", 113.2, 40.9, "steppe", "mongols"],
  ["yehuling", "Yehuling", "pass", 114.6, 40.85, "upland", "mongols"],
  ["huan-pastures", "Huan pastures", "pasture", 115.2, 41.45, "steppe", "mongols"],
  ["yanggao", "Yanggao", "junction", 113.75, 40.36, "upland", "mongols"],
  ["xuande", "Xuande", "city", 115.05, 40.6, "upland", "mongols"],
  ["huairen", "Huairen", "junction", 113.1, 39.82, "upland", "contested"],
  ["yingzhou", "Yingzhou", "city", 113.19, 39.56, "upland", "contested"],
  ["shuozhou", "Shuozhou", "city", 112.43, 39.33, "upland", "contested"],
  ["hunyuan", "Hunyuan", "junction", 113.69, 39.7, "upland", "contested"],
  ["weizhou", "Weizhou", "junction", 114.57, 39.84, "upland", "contested"],
  // passes and mountains
  ["yanmen", "Yanmen Pass", "pass", 112.88, 39.18, "mountain", "jin", false],
  ["ningwu", "Ningwu", "junction", 112.3, 39.0, "mountain", "contested"],
  ["jingle", "Jingle", "junction", 111.94, 38.36, "mountain", "jin"],
  ["lingqiu", "Lingqiu", "junction", 114.23, 39.44, "mountain", "contested"],
  ["laiyuan", "Laiyuan", "junction", 114.69, 39.36, "mountain", "contested"],
  ["zijing", "Zijing Pass", "pass", 115.17, 39.43, "mountain", "contested", false],
  ["wutai", "Wutai", "junction", 113.25, 38.73, "mountain", "jin"],
  ["fuping", "Fuping", "junction", 114.2, 38.85, "mountain", "contested"],
  ["shiling", "Shiling Pass", "pass", 112.62, 38.17, "mountain", "jin", false],
  ["niangzi", "Niangzi Pass", "pass", 113.88, 37.98, "mountain", "jin", false],
  ["juyong", "Juyong Pass", "pass", 116.07, 40.29, "mountain", "mongols", false],
  // Xinding basin and Taiyuan
  ["daizhou", "Daizhou", "city", 112.96, 39.07, "upland", "jin"],
  ["yuanping", "Yuanping", "city", 112.71, 38.73, "plain", "jin"],
  ["xinzhou", "Xinzhou", "city", 112.73, 38.42, "plain", "jin"],
  ["taiyuan", "Taiyuan", "city", 112.55, 37.87, "plain", "jin"],
  ["yuci", "Yuci", "city", 112.72, 37.68, "plain", "jin"],
  ["pingding", "Pingding", "junction", 113.58, 37.86, "mountain", "jin"],
  ["fenzhou", "Fenzhou", "city", 111.78, 37.27, "plain", "jin"],
  // Hebei plain
  ["zhongdu", "Zhongdu", "city", 116.4, 39.9, "plain", "mongols"],
  ["zhuozhou", "Zhuozhou", "city", 115.97, 39.49, "plain", "mongols"],
  ["yizhou", "Yizhou", "city", 115.49, 39.35, "plain", "contested"],
  ["baozhou", "Baozhou", "city", 115.47, 38.87, "plain", "contested"],
  ["zhending", "Zhending", "city", 114.57, 38.15, "plain", "contested"],
];

const LINKS: [string, string, LinkKind][] = [
  ["datong", "xijing-pastures", "track"],
  ["datong", "fengzhou", "track"],
  ["datong", "yanggao", "road"],
  ["datong", "huairen", "road"],
  ["datong", "hunyuan", "road"],
  ["yanggao", "xuande", "road"],
  ["yanggao", "weizhou", "track"],
  ["xijing-pastures", "yehuling", "track"],
  ["yehuling", "huan-pastures", "track"],
  ["yehuling", "xuande", "pass"],
  ["xuande", "juyong", "pass"],
  ["juyong", "zhongdu", "pass"],
  ["huairen", "yingzhou", "road"],
  ["huairen", "shuozhou", "track"],
  ["hunyuan", "yingzhou", "track"],
  ["hunyuan", "lingqiu", "mountain"],
  ["yingzhou", "yanmen", "pass"],
  ["yanmen", "daizhou", "pass"],
  ["shuozhou", "ningwu", "mountain"],
  ["ningwu", "yuanping", "mountain"],
  ["ningwu", "jingle", "mountain"],
  ["jingle", "taiyuan", "mountain"],
  ["daizhou", "yuanping", "road"],
  ["daizhou", "wutai", "mountain"],
  ["yuanping", "xinzhou", "road"],
  ["xinzhou", "shiling", "pass"],
  ["shiling", "taiyuan", "pass"],
  ["taiyuan", "yuci", "road"],
  ["taiyuan", "fenzhou", "road"],
  ["yuci", "pingding", "mountain"],
  ["pingding", "niangzi", "pass"],
  ["niangzi", "zhending", "pass"],
  ["wutai", "fuping", "mountain"],
  ["fuping", "zhending", "track"],
  ["fuping", "baozhou", "track"],
  ["weizhou", "lingqiu", "mountain"],
  ["weizhou", "laiyuan", "mountain"],
  ["lingqiu", "laiyuan", "mountain"],
  ["laiyuan", "zijing", "pass"],
  ["zijing", "yizhou", "pass"],
  ["yizhou", "zhuozhou", "road"],
  ["yizhou", "baozhou", "road"],
  ["zhuozhou", "zhongdu", "road"],
  ["zhuozhou", "baozhou", "road"],
  ["baozhou", "zhending", "road"],
];

const sites: Site[] = SITES.map(([id, name, kind, lon, lat, terrain, control, water = true]) => ({ id, name, kind, lon, lat, terrain, control, water }));

export interface ColumnSpec { name: string; men: number; horsesPerMan: number; rationsPerMan: number; condition: number }

export const SCENARIO = {
  name: "Into Shanxi, 1218",
  graph: buildGraph(sites, LINKS),
  start: { year: 1218, month: 8, day: 1, hour: 0 } satisfies GameDate,
  end: { year: 1219, month: 2, day: 31, hour: 0 } satisfies GameDate,
  base: "datong",
  objective: "taiyuan",
  column: { name: "Muqali", men: 3000, horsesPerMan: 4, rationsPerMan: 20, condition: 85 },
  /** columns the khan sends during the campaign: they appear at a site on a date [S] */
  reinforcements: [
    {
      date: { year: 1218, month: 10, day: 1, hour: 0 },
      at: "datong",
      column: { name: "Uyar", men: 2000, horsesPerMan: 3, rationsPerMan: 15, condition: 75 },
      message: "A rider from the khan: Uyar's Khitan horsemen reach Datong, 2,000 men.",
    },
  ] as { date: GameDate; at: string; column: ColumnSpec; message: string }[],
  /** Jin strongholds that can be besieged: type, garrison, stores in days, and walls when they differ from the type [S] */
  cities: {
    daizhou: { type: "town", garrison: 1000, stores: 40 },
    yuanping: { type: "town", garrison: 600, stores: 30 },
    yuci: { type: "town", garrison: 800, stores: 35 },
    xinzhou: { type: "walled", garrison: 1500, stores: 45 },
    fenzhou: { type: "walled", garrison: 2000, stores: 50 },
    taiyuan: { type: "walled", garrison: 10000, stores: 120, walls: 3 },
    yanmen: { type: "fortress", garrison: 500, stores: 20 },
    shiling: { type: "fortress", garrison: 600, stores: 20 },
    niangzi: { type: "fortress", garrison: 500, stores: 20 },
  } as Record<string, { type: CityType; garrison: number; stores: number; walls?: number }>,
  /** sheep the player can take along at the start */
  flockOptions: [0, 3000, 6000],
};
