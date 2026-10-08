// Game world data: regions, cities and main roads.
// Coordinates in degrees (lon, lat). Region values are still made up for the prototype.

export type Terrain = "steppe" | "desert" | "upland" | "mountain" | "plain";
export type Control = "mongols" | "jin" | "contested" | "xixia";
export type Diplomacy = "ally" | "neutral" | "hostile";

export interface Region {
  id: number;
  name: string;
  lon: number;
  lat: number;
  terrain: Terrain;
  /** pasture quality, 0 to 100 */
  pasture: number;
  control: Control;
  diplomacy: Diplomacy;
}

export interface City {
  name: string;
  lon: number;
  lat: number;
  capital: boolean;
}

type RegionRow = [string, number, number, Terrain, number, Control, Diplomacy];

const REGION_ROWS: RegionRow[] = [
  ["Mongolian Steppe", 111.5, 44.6, "steppe", 85, "mongols", "ally"],
  ["Xilin Pastures", 116.8, 43.6, "steppe", 75, "mongols", "ally"],
  ["Gobi", 104.8, 42.3, "desert", 10, "mongols", "ally"],
  ["Xi Xia", 105.6, 37.8, "desert", 30, "xixia", "neutral"],
  ["Ordos", 108.9, 39.4, "steppe", 50, "contested", "neutral"],
  ["Xijing", 113.3, 40.4, "upland", 55, "contested", "neutral"],
  ["Zhongdu", 116.4, 39.6, "plain", 35, "mongols", "neutral"],
  ["Beijing lu", 119.3, 41.6, "upland", 50, "contested", "neutral"],
  ["Liaodong", 122.8, 41.4, "plain", 40, "contested", "ally"],
  ["Taiyuan", 112.2, 38.0, "mountain", 25, "jin", "hostile"],
  ["Pingyang", 111.4, 35.9, "mountain", 25, "jin", "hostile"],
  ["West Hebei", 114.3, 38.4, "plain", 35, "contested", "neutral"],
  ["East Hebei", 116.9, 38.0, "plain", 35, "contested", "neutral"],
  ["Daming", 115.2, 36.4, "plain", 30, "jin", "hostile"],
  ["West Shandong", 116.6, 35.6, "plain", 30, "jin", "neutral"],
  ["East Shandong", 119.2, 36.5, "upland", 25, "contested", "neutral"],
  ["Jingzhao", 108.6, 34.3, "mountain", 20, "jin", "hostile"],
  ["Nanjing", 114.3, 34.1, "plain", 20, "jin", "hostile"],
];

export const REGIONS: readonly Region[] = REGION_ROWS.map(
  ([name, lon, lat, terrain, pasture, control, diplomacy], id) => ({ id, name, lon, lat, terrain, pasture, control, diplomacy }),
);

export const CITIES: readonly City[] = (
  [
    ["Zhongdu", 116.4, 39.9, true], ["Datong", 113.3, 40.1, false], ["Taiyuan", 112.55, 37.87, false],
    ["Kaifeng", 114.3, 34.8, true], ["Liaoyang", 123.2, 41.27, false], ["Zhending", 114.57, 38.15, false],
    ["Dongping", 116.3, 35.9, false], ["Yidu", 118.5, 36.7, false], ["Daming", 115.15, 36.28, false],
    ["Xingqing", 106.27, 38.47, true], ["Jingzhao", 108.94, 34.27, false], ["Pingyang", 111.52, 36.08, false],
  ] as const
).map(([name, lon, lat, capital]) => ({ name, lon, lat, capital }));

/** Main roads, as sequences of (lon, lat) points. Routes are approximate. */
export const ROADS: readonly (readonly [number, number])[][] = [
  [[113.3, 40.1], [114.6, 40.85], [115.05, 40.6], [116.07, 40.29], [116.4, 39.9]],
  [[113.3, 40.1], [112.88, 39.18], [112.73, 38.42], [112.55, 37.87]],
  [[113.3, 40.1], [114.2, 39.45], [115.17, 39.43], [115.5, 39.35], [116.4, 39.9]],
  [[116.4, 39.9], [116.85, 40.38], [117.15, 40.69], [117.0, 41.6], [116.2, 42.8]],
  [[116.4, 39.9], [115.47, 38.87], [114.57, 38.15], [113.88, 37.98], [113.58, 37.86], [112.55, 37.87]],
  [[116.4, 39.9], [118.17, 39.63], [119.75, 40.0], [121.1, 41.1], [123.2, 41.27]],
  [[114.3, 34.8], [112.45, 34.62], [110.25, 34.6], [108.94, 34.27]],
  [[112.55, 37.87], [111.52, 36.08], [110.35, 34.85], [110.25, 34.6]],
  [[114.57, 38.15], [115.15, 36.28], [114.3, 34.8]],
  [[116.4, 39.9], [116.3, 35.9], [118.5, 36.7]],
];
