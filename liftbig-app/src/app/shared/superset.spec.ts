import {
  blockRange,
  newSupersetId,
  normalizeSupersets,
  SupersetMember,
  toGroupBlocks,
} from './superset';

interface G extends SupersetMember {
  id: string;
}

function g(id: string, supersetGroup: string | null = null): G {
  return { id, supersetGroup };
}

function ids(groups: G[]): string[] {
  return groups.map((x) => x.id);
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newSupersetId', () => {
  it('returns a v4 UUID, different on each call', () => {
    const a = newSupersetId();
    const b = newSupersetId();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });

  describe('without crypto.randomUUID (insecure context)', () => {
    beforeEach(() => {
      // Own property shadows Crypto.prototype.randomUUID
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    });

    afterEach(() => {
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    });

    it('falls back to getRandomValues and still returns a v4 UUID', () => {
      const getRandomValues = spyOn(crypto, 'getRandomValues').and.callThrough();

      const id = newSupersetId();

      expect(getRandomValues).toHaveBeenCalledTimes(1);
      expect(id).toMatch(UUID_V4);
      expect(newSupersetId()).not.toBe(id);
    });

    it('sets the version and variant bits whatever the random bytes are', () => {
      const fill = (byte: number) =>
        (<T extends ArrayBufferView | null>(array: T): T => {
          (array as unknown as Uint8Array).fill(byte);
          return array;
        }) as Crypto['getRandomValues'];
      const getRandomValues = spyOn(crypto, 'getRandomValues');

      getRandomValues.and.callFake(fill(0x00));
      expect(newSupersetId()).toBe('00000000-0000-4000-8000-000000000000');

      getRandomValues.and.callFake(fill(0xff));
      expect(newSupersetId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    });
  });
});

describe('normalizeSupersets', () => {
  it('keeps an adjacent 3-member superset together and in order', () => {
    const groups = [g('a'), g('b', 's1'), g('c', 's1'), g('d', 's1'), g('e')];

    const result = normalizeSupersets(groups);

    expect(ids(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.map((x) => x.supersetGroup)).toEqual([null, 's1', 's1', 's1', null]);
  });

  it('moves non-adjacent members next to the first member, keeping their order', () => {
    const groups = [g('a', 's1'), g('b'), g('c', 's1'), g('d'), g('e', 's1')];

    const result = normalizeSupersets(groups);

    expect(ids(result)).toEqual(['a', 'c', 'e', 'b', 'd']);
    // A new array; the input array keeps its order
    expect(result).not.toBe(groups);
    expect(ids(groups)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('clears a lone member in place and leaves the order alone', () => {
    const lone = g('b', 's1');
    const groups = [g('a'), lone, g('c')];

    const result = normalizeSupersets(groups);

    expect(ids(result)).toEqual(['a', 'b', 'c']);
    expect(result[1]).toBe(lone);
    expect(lone.supersetGroup).toBeNull();
  });

  it('keeps two separate supersets that sit next to each other', () => {
    const groups = [g('a', 's1'), g('b', 's1'), g('c', 's2'), g('d', 's2')];

    const result = normalizeSupersets(groups);

    expect(ids(result)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.map((x) => x.supersetGroup)).toEqual(['s1', 's1', 's2', 's2']);
  });

  it('returns an empty array for no groups', () => {
    expect(normalizeSupersets<G>([])).toEqual([]);
  });
});

describe('toGroupBlocks', () => {
  it('makes one block per single group and one per superset run, keyed by the first group', () => {
    const groups = [g('a'), g('b', 's1'), g('c', 's1'), g('d', 's1'), g('e')];

    const blocks = toGroupBlocks(groups);

    expect(blocks.length).toBe(3);
    expect(blocks.map((b) => b.superset)).toEqual([false, true, false]);
    expect(blocks.map((b) => ids(b.groups))).toEqual([['a'], ['b', 'c', 'd'], ['e']]);
    expect(blocks.map((b) => b.key)).toEqual([groups[0], groups[1], groups[4]]);
  });

  it('splits two adjacent supersets into two blocks', () => {
    const blocks = toGroupBlocks([g('a', 's1'), g('b', 's1'), g('c', 's2'), g('d', 's2')]);

    expect(blocks.map((b) => ids(b.groups))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(blocks.every((b) => b.superset)).toBeTrue();
  });

  it('does not join non-adjacent members (callers normalize first)', () => {
    const blocks = toGroupBlocks([g('a', 's1'), g('b'), g('c', 's1')]);

    expect(blocks.map((b) => ids(b.groups))).toEqual([['a'], ['b'], ['c']]);
    expect(blocks.some((b) => b.superset)).toBeFalse();
  });

  it('returns no blocks for no groups', () => {
    expect(toGroupBlocks<G>([])).toEqual([]);
  });
});

describe('blockRange', () => {
  it('returns [index, index] for a group outside a superset, including the first and last', () => {
    const groups = [g('a'), g('b', 's1'), g('c', 's1'), g('d')];

    expect(blockRange(groups, 0)).toEqual([0, 0]);
    expect(blockRange(groups, 3)).toEqual([3, 3]);
  });

  it('returns the whole run for any member of a superset in the middle', () => {
    const groups = [g('a'), g('b', 's1'), g('c', 's1'), g('d', 's1'), g('e')];

    for (const i of [1, 2, 3]) {
      expect(blockRange(groups, i)).withContext(`index ${i}`).toEqual([1, 3]);
    }
  });

  it('handles a superset at the start and one at the end of the list', () => {
    const groups = [g('a', 's1'), g('b', 's1'), g('c'), g('d', 's2'), g('e', 's2')];

    expect(blockRange(groups, 0)).toEqual([0, 1]);
    expect(blockRange(groups, 1)).toEqual([0, 1]);
    expect(blockRange(groups, 3)).toEqual([3, 4]);
    expect(blockRange(groups, 4)).toEqual([3, 4]);
  });

  it('does not run into an adjacent superset', () => {
    const groups = [g('a', 's1'), g('b', 's1'), g('c', 's2'), g('d', 's2')];

    expect(blockRange(groups, 1)).toEqual([0, 1]);
    expect(blockRange(groups, 2)).toEqual([2, 3]);
  });

  it('returns [0, 0] for a single-group list', () => {
    expect(blockRange([g('a', 's1')], 0)).toEqual([0, 0]);
  });
});
