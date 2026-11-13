// Helpers for sending DPI stages to the mouse. Pure functions, no hardware access.
import type { DpiStage } from '../types/config';

/** The mouse's DPI codes (vendor table). Code 11 does not exist (the vendor skips 2200 DPI). */
const DPI_BY_CODE: Readonly<Record<number, number>> = {
  1: 200, 2: 400, 3: 600, 4: 800, 5: 1000, 6: 1200, 7: 1400, 8: 1600, 9: 1800, 10: 2000,
  12: 2400, 13: 3200, 14: 4000, 15: 4800, 16: 5600, 17: 6400, 18: 7200, 19: 8000, 20: 8800,
  21: 9600, 22: 10400, 23: 11200, 24: 12800,
};

/** DPI values the mouse understands (vendor table), ascending. */
export const SUPPORTED_DPI: number[] = Object.keys(DPI_BY_CODE)
  .map(Number)
  .sort((a, b) => a - b)
  .map((c) => DPI_BY_CODE[c]);

export function nearestSupportedDpi(dpi: number): number {
  return SUPPORTED_DPI.reduce((best, v) => (Math.abs(v - dpi) < Math.abs(best - dpi) ? v : best), SUPPORTED_DPI[0]);
}

/** Reasons the stages cannot be sent as they are. Empty means they can. */
export function dpiSendProblems(stages: DpiStage[], active: number): string[] {
  const problems: string[] = [];
  if (stages.length !== 6) problems.push('The mouse stores exactly 6 stages.');
  const bad = stages.map((s, i) => [i, s.dpi] as const).filter(([, d]) => !SUPPORTED_DPI.includes(d));
  if (bad.length > 0) problems.push(`Stage ${bad.map(([i]) => i + 1).join(', ')} uses a value the mouse does not have.`);
  if (active < 0 || active > 5) problems.push('The active stage must be one of the 6 stages.');
  return problems;
}
