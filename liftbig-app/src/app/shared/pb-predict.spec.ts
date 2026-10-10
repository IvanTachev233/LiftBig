import { PbLift, predictPb } from './pb-predict';

describe('predictPb', () => {
  // A made 1 x 105 kg set unless overridden
  const set = (overrides: Partial<PbLift> = {}): PbLift => ({
    made: true,
    reps: 1,
    actualReps: null,
    weight: 105,
    actualWeight: null,
    ...overrides,
  });
  const bars = { 1: 100, 2: null, 3: 90 };

  it('is true for a qualifying set strictly heavier than the bar for its reps', () => {
    expect(predictPb(set(), bars, true, [])).toBeTrue();
    expect(predictPb(set({ weight: 100.01 }), bars, true, [])).toBeTrue();
  });

  it('is false for a set equal to or lighter than the bar, compared in cents', () => {
    expect(predictPb(set({ weight: 100 }), bars, true, [])).toBeFalse();
    expect(predictPb(set({ weight: 100.004 }), bars, true, [])).toBeFalse();
    expect(predictPb(set({ weight: 95 }), bars, true, [])).toBeFalse();
  });

  it('is true when no entry exists for that rep count (null bar)', () => {
    expect(predictPb(set({ reps: 2, weight: 20 }), bars, true, [])).toBeTrue();
  });

  it('counts actual reps and weight over planned', () => {
    expect(predictPb(set({ weight: 95, actualWeight: 101 }), bars, true, [])).toBeTrue();
    expect(predictPb(set({ weight: 120, actualWeight: 99 }), bars, true, [])).toBeFalse();
    // Planned 1 rep done as 3: compared with the 3RM bar (90)
    expect(predictPb(set({ weight: 95, actualReps: 3 }), bars, true, [])).toBeTrue();
  });

  it('is false for a set that does not qualify, even without bars', () => {
    for (const [label, s] of [
      ['not logged', set({ made: null })],
      ['missed', set({ made: false })],
      ['4 reps', set({ reps: 4 })],
      ['4 actual reps', set({ actualReps: 4 })],
      ['0 reps', set({ actualReps: 0 })],
      ['no weight', set({ weight: null })],
      ['weight 0', set({ weight: 0 })],
    ] as const) {
      expect(predictPb(s, bars, true, [])).withContext(label).toBeFalse();
      expect(predictPb(s, undefined, true, [])).withContext(`${label}, no bars`).toBeFalse();
    }
    expect(predictPb(set(), bars, false, [])).withContext('not max-trackable').toBeFalse();
  });

  it('is null (no guess) for a qualifying set when the card has no bars', () => {
    expect(predictPb(set(), undefined, true, [])).toBeNull();
    expect(predictPb(set(), null, true, [])).toBeNull();
  });

  it('is false when another trophied set of the same reps is as heavy or heavier', () => {
    expect(predictPb(set(), bars, true, [set({ weight: 105 })])).toBeFalse();
    expect(predictPb(set(), bars, true, [set({ weight: 110 })])).toBeFalse();
    expect(predictPb(set(), bars, true, [set({ weight: 102 })])).toBeTrue();
  });

  it('ignores trophied sets of another rep count', () => {
    expect(predictPb(set(), bars, true, [set({ reps: 2, weight: 200 })])).toBeTrue();
  });

  it('accepts numeric strings from inputs', () => {
    expect(predictPb(set({ actualReps: '1' as any, actualWeight: '101' as any }), bars, true, [])).toBeTrue();
  });
});
