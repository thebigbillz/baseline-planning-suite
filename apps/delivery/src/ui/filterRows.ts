import type { GridRow } from '../domain/grid';

/**
 * Keeps rows whose work item or person matches, along with their ancestors
 * (for context) and, when a work item matches, everything beneath it.
 */
export function filterRows(rows: readonly GridRow[], query: string): readonly GridRow[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return rows;

  const matches = (row: GridRow): boolean =>
    (row.kind === 'item' ? row.item.name : (row.employee?.name ?? '')).toLowerCase().includes(needle);

  const keep = new Set<number>();
  rows.forEach((row, index) => {
    if (!matches(row)) return;
    keep.add(index);
    // Ancestors: walk back to each shallower row.
    let depth = row.depth;
    for (let above = index - 1; above >= 0 && depth > 1; above -= 1) {
      const candidate = rows[above];
      if (candidate !== undefined && candidate.kind === 'item' && candidate.depth < depth) {
        keep.add(above);
        depth = candidate.depth;
      }
    }
    // Descendants of a matching work item.
    if (row.kind === 'item') {
      for (let below = index + 1; below < rows.length && (rows[below]?.depth ?? 0) > row.depth; below += 1) keep.add(below);
    }
  });
  return rows.filter((_, index) => keep.has(index));
}
