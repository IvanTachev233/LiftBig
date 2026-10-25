/** An exercise group that can belong to a superset (groups sharing a supersetGroup) */
export interface SupersetMember {
  supersetGroup: string | null;
}

/** One rendered block: a superset of >= 2 adjacent groups, or a single group */
export interface GroupBlock<T> {
  // Stable @for track key: the block's first group
  key: T;
  superset: boolean;
  groups: T[];
}

/** New superset id. Falls back to getRandomValues where randomUUID is missing (insecure context) */
export function newSupersetId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Clears supersetGroup in place (mutating the given group objects) for any superset
 * left with a single member, then returns a new array with the members of each
 * superset moved next to its first member. The input array's order is left as is.
 */
export function normalizeSupersets<T extends SupersetMember>(groups: T[]): T[] {
  const counts = new Map<string, number>();
  for (const g of groups) {
    if (g.supersetGroup) {
      counts.set(g.supersetGroup, (counts.get(g.supersetGroup) ?? 0) + 1);
    }
  }
  for (const g of groups) {
    if (g.supersetGroup && (counts.get(g.supersetGroup) ?? 0) < 2) {
      g.supersetGroup = null;
    }
  }

  const result: T[] = [];
  const placed = new Set<T>();
  for (const g of groups) {
    if (placed.has(g)) continue;
    const members = g.supersetGroup
      ? groups.filter((m) => m.supersetGroup === g.supersetGroup)
      : [g];
    for (const m of members) {
      result.push(m);
      placed.add(m);
    }
  }
  return result;
}

/** Splits groups into display blocks; adjacent groups sharing a supersetGroup form one block */
export function toGroupBlocks<T extends SupersetMember>(groups: T[]): GroupBlock<T>[] {
  const blocks: GroupBlock<T>[] = [];
  for (const g of groups) {
    const last = blocks[blocks.length - 1];
    if (g.supersetGroup && last && last.groups[0].supersetGroup === g.supersetGroup) {
      last.groups.push(g);
      last.superset = true;
    } else {
      blocks.push({ key: g, superset: false, groups: [g] });
    }
  }
  return blocks;
}

/** Index range [start, end] of the block (superset run or single group) containing index */
export function blockRange<T extends SupersetMember>(groups: T[], index: number): [number, number] {
  const id = groups[index].supersetGroup;
  let start = index;
  let end = index;
  if (id) {
    while (start > 0 && groups[start - 1].supersetGroup === id) start--;
    while (end < groups.length - 1 && groups[end + 1].supersetGroup === id) end++;
  }
  return [start, end];
}
