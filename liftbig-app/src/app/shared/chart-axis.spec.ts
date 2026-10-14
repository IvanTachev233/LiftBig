import { dateAxis } from './chart-axis';

const day = (d: number, m = 9, y = 2026) => Date.UTC(y, m, d);
const DAY = 24 * 60 * 60 * 1000;

describe('dateAxis', () => {
  it('centres a single date between whole days around it', () => {
    const axis = dateAxis([day(14)])!;
    expect(axis.ticks).toEqual([day(12), day(13), day(14), day(15), day(16)]);
    expect(axis.min).toBeLessThan(day(12));
    expect(axis.max).toBeGreaterThan(day(16));
    expect(axis.label(day(14))).toBe(new Date(day(14)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }));
  });

  it('puts ticks on the midnights of the points for a short span', () => {
    const axis = dateAxis([day(11), day(14)])!;
    expect(axis.ticks).toEqual([day(11), day(12), day(13), day(14)]);
    expect(axis.min).toBe(day(11) - DAY / 2);
    expect(axis.max).toBe(day(14) + DAY / 2);
  });

  it('steps whole days, at most 5 ticks, ending on the newest point', () => {
    const axis = dateAxis([day(1), day(20)])!;
    expect(axis.ticks.length).toBeLessThanOrEqual(5);
    expect(axis.ticks[axis.ticks.length - 1]).toBe(day(20));
    for (const t of axis.ticks) expect((day(20) - t) % DAY).toBe(0);
    expect(axis.ticks[0]).toBeLessThanOrEqual(day(1));
    expect(axis.min).toBeLessThan(axis.ticks[0]);
    expect(axis.max).toBeGreaterThan(day(20));
  });

  it('uses month starts from two months on, covering every point', () => {
    const points = [day(1, 2), day(1, 7), day(5, 9)];
    const axis = dateAxis(points)!;
    expect(axis.ticks.length).toBeLessThanOrEqual(5);
    for (const t of axis.ticks) expect(new Date(t).getUTCDate()).toBe(1);
    expect(axis.ticks[0]).toBeLessThanOrEqual(points[0]);
    expect(axis.ticks[axis.ticks.length - 1]).toBeGreaterThanOrEqual(points[2]);
    expect(axis.min).toBe(axis.ticks[0]);
    expect(axis.max).toBe(axis.ticks[axis.ticks.length - 1]);
    expect(axis.label(day(1, 2))).toBe('Mar');
  });

  it('is null without points', () => {
    expect(dateAxis([])).toBeNull();
  });
});
