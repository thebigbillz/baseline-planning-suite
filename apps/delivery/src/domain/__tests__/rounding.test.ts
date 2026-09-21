import { describe, expect, it } from 'vitest';
import { apportion, formatUnits } from '../rounding';

const total = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);

describe('largest-remainder apportionment', () => {
  it('makes three thirds add up to the rounded total', () => {
    const cells = apportion([1 / 3, 1 / 3, 1 / 3], 2);
    expect(cells).toEqual([34, 33, 33]);
    expect(total(cells)).toBe(100);
  });

  it('gives the spare units to the largest remainders, not the first cells', () => {
    expect(apportion([0.104, 0.108, 0.106, 0.002], 2)).toEqual([10, 11, 11, 0]);
  });

  it('rounds the total once, from exact values', () => {
    // Naive per-cell rounding gives 0.01 × 3 = 0.03; the exact total is 0.0135 → 0.01.
    const cells = apportion([0.0045, 0.0045, 0.0045], 2);
    expect(total(cells)).toBe(1);
  });

  it('is not fooled by floating-point representation', () => {
    // 0.29 * 100 === 28.999999999999996
    expect(apportion([0.29, 0.57, 0.14], 2)).toEqual([29, 57, 14]);
    expect(apportion([7880, 2562.56, 1464.8], 2)).toEqual([788000, 256256, 146480]);
  });

  it('leaves already-exact values alone', () => {
    expect(apportion([0.5, 0.2, 0.59], 2)).toEqual([50, 20, 59]);
  });

  it('works at one decimal for percentages', () => {
    const cells = apportion([33.333, 33.333, 33.334], 1);
    expect(total(cells)).toBe(1000);
  });

  it('handles an empty list', () => {
    expect(apportion([], 2)).toEqual([]);
  });

  it('formats display units at fixed precision', () => {
    expect(formatUnits(788000, 2)).toBe('7,880.00');
    expect(formatUnits(500, 1)).toBe('50.0');
    expect(formatUnits(0, 2)).toBe('0.00');
  });
});
