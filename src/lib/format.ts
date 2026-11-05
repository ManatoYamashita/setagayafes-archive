// Text formatting shared by the archive screens.

import type { IsoDate } from "../data/festivals.ts";

/**
 * Formats a festival's dates compactly, keeping only the parts that change:
 *
 * - "2026-10-31" to "2026-11-01" → "2026.10.31–11.01"
 * - "2012-11-24" to "2012-11-25" → "2012.11.24–25"
 * - "2011-11-20" to "2011-11-20" → "2011.11.20"
 */
export function formatDateRange(start: IsoDate, end: IsoDate): string {
  const [startYear, startMonth, startDay] = start.split("-");
  const [endYear, endMonth, endDay] = end.split("-");
  const first = `${startYear}.${startMonth}.${startDay}`;
  if (start === end) return first;
  if (startYear !== endYear) return `${first}–${endYear}.${endMonth}.${endDay}`;
  if (startMonth !== endMonth) return `${first}–${endMonth}.${endDay}`;
  return `${first}–${endDay}`;
}

/** "第97回" — the festival's round as written in Japanese. */
export function roundLabel(round: number): string {
  return `第${round}回`;
}
