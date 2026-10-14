const DAY = 24 * 60 * 60 * 1000;
const MAX_TICKS = 5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DateAxis {
  min: number;
  max: number;
  /** UTC midnights (days) or UTC month starts */
  ticks: number[];
  label: (time: number) => string;
}

const dayLabel = (time: number) =>
  new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthLabel = (time: number) => MONTHS[new Date(time).getUTCMonth()];

/**
 * A time axis for points on UTC midnights: day ticks under two months,
 * ending on the newest point (a lone date gets two days either side), month
 * starts from then on, at most 5 ticks, every point between min and max
 */
export function dateAxis(xs: number[]): DateAxis | null {
  if (!xs.length) return null;
  const first = Math.min(...xs);
  const last = Math.max(...xs);
  const spanDays = Math.round((last - first) / DAY);

  if (spanDays < 60) {
    const step = spanDays === 0 ? 1 : Math.ceil(spanDays / (MAX_TICKS - 1));
    const count = spanDays === 0 ? MAX_TICKS : Math.ceil(spanDays / step) + 1;
    // Counted back from the newest point, so it sits on a tick and no tick is later
    const end = spanDays === 0 ? last + 2 * DAY : last;
    const ticks = Array.from({ length: count }, (_, i) => end - (count - 1 - i) * step * DAY);
    // Half a step of room keeps the end points and labels inside the chart
    const pad = (step * DAY) / 2;
    return { min: ticks[0] - pad, max: ticks[ticks.length - 1] + pad, ticks, label: dayLabel };
  }

  const startDate = new Date(first);
  const lastDate = new Date(last);
  const startIndex = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
  const lastIndex = lastDate.getUTCFullYear() * 12 + lastDate.getUTCMonth();
  // The month after the last point, unless it falls on a month start
  const endIndex = lastDate.getUTCDate() === 1 ? lastIndex : lastIndex + 1;
  const step = Math.ceil((endIndex - startIndex) / (MAX_TICKS - 1));
  const ticks: number[] = [];
  for (let m = startIndex; ; m += step) {
    ticks.push(Date.UTC(Math.floor(m / 12), m % 12, 1));
    if (m >= endIndex) break;
  }
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks, label: monthLabel };
}
