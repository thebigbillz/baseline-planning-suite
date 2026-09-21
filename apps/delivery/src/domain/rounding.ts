/**
 * Largest-remainder apportionment. Totals are computed from exact values and
 * rounded once; the cells are then rounded so that they add up to that rounded
 * total exactly. Returns integers in display units (cents for 2 dp), in the
 * order given.
 *
 * The epsilon absorbs floating-point noise such as 0.29 * 100 = 28.999999…;
 * it is an allowance for representation, not a rounding budget.
 */
const EPSILON = 1e-7;

export function apportion(exact: readonly number[], decimals: number): number[] {
  const scale = 10 ** decimals;
  const scaled = exact.map((value) => value * scale);
  const floors = scaled.map((value) => Math.floor(value + EPSILON));
  const target = Math.round(scaled.reduce((sum, value) => sum + value, 0) + EPSILON);
  let remaining = target - floors.reduce((sum, value) => sum + value, 0);

  const byRemainder = scaled
    .map((value, index) => ({ index, remainder: value - (floors[index] ?? 0) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const result = [...floors];
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remaining -= 1;
  }
  return result;
}

/** Formats an integer in display units back to a fixed-precision string, e.g. 788000 → "7,880.00". */
export function formatUnits(units: number, decimals: number): string {
  const scale = 10 ** decimals;
  return (units / scale).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
