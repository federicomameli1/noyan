// Game time is counted in whole hours from the start of the scenario.
// The calendar uses ordinary month lengths; 1218 and 1219 are not leap years.

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface GameDate {
  year: number;
  /** 0 = January */
  month: number;
  /** 1 to 31 */
  day: number;
  hour: number;
}

const isLeap = (y: number) => y % 4 === 0;
const daysIn = (y: number, m: number) => (m === 1 && isLeap(y) ? 29 : MONTH_DAYS[m]);

/** Date reached after `hours` hours from `start`. */
export function addHours(start: GameDate, hours: number): GameDate {
  let { year, month, day } = start;
  let hour = start.hour + hours;
  let days = Math.floor(hour / 24);
  hour -= days * 24;
  while (days > 0) {
    const left = daysIn(year, month) - day;
    if (days <= left) { day += days; break; }
    days -= left + 1;
    day = 1;
    if (++month === 12) { month = 0; year++; }
  }
  return { year, month, day, hour };
}

/** Whole days from a to b (b later than a). */
export function daysBetween(a: GameDate, b: GameDate): number {
  let n = 0;
  let { year, month, day } = a;
  while (year < b.year || month < b.month) {
    n += daysIn(year, month) - day + 1;
    day = 1;
    if (++month === 12) { month = 0; year++; }
  }
  return n + b.day - day;
}

export const formatDate = (d: GameDate) => `${d.day} ${MONTH_NAMES[d.month]} ${d.year}`;
