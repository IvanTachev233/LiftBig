import { e1rmPoints, estimateOneRepMax } from './e1rm';

describe('estimateOneRepMax', () => {
  it('uses Epley, with a single as its own weight', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 3)).toBe(110);
    expect(estimateOneRepMax(90, 2)).toBe(96);
  });
});

describe('e1rmPoints', () => {
  const entry = (reps: number, weightKg: number, achievedOn: string, createdAt = '2026-01-01T00:00:00Z') => ({
    reps,
    weightKg,
    achievedOn,
    createdAt,
  });

  it('gives one point per 1-3 rep entry, oldest first', () => {
    const points = e1rmPoints([
      entry(3, 100, '2026-10-05'),
      entry(1, 100, '2026-09-01'),
      entry(2, 90, '2026-09-20'),
    ]);
    expect(points).toEqual([
      { x: Date.UTC(2026, 8, 1), y: 100 },
      { x: Date.UTC(2026, 8, 20), y: 96 },
      { x: Date.UTC(2026, 9, 5), y: 110 },
    ]);
  });

  it('orders entries of one day by createdAt and skips other rep counts', () => {
    const points = e1rmPoints([
      entry(1, 105, '2026-10-01', '2026-10-01T12:00:00Z'),
      entry(1, 100, '2026-10-01', '2026-10-01T08:00:00Z'),
      entry(5, 80, '2026-10-02'),
    ]);
    expect(points.map((p) => p.y)).toEqual([100, 105]);
  });
});
