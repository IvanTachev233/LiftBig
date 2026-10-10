import { PbBars } from '../core/workout.service';

const MAX_PB_REPS = 3;

/** A set's planned and logged values; weights in kg */
export interface PbLift {
  made: boolean | null;
  reps: number;
  actualReps: number | null;
  weight: number | null;
  actualWeight: number | null;
}

// Kilograms compared at the stored precision (2 decimals), as the API does
const toCents = (kg: number) => Math.round(kg * 100);

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '';

/**
 * The reps and weight (in cents) a set counts with, as the API's
 * qualifyingLift: made, 1-3 reps and a weight (actual over planned), on a
 * max-trackable exercise; null when it can't be a PB
 */
function qualifyingLift(set: PbLift, isMaxTrackable: boolean) {
  if (!isMaxTrackable || set.made !== true) return null;
  const reps = Number(isSet(set.actualReps) ? set.actualReps : set.reps);
  const cents = toCents(Number(isSet(set.actualWeight) ? set.actualWeight : (set.weight ?? 0)));
  if (!(reps >= 1 && reps <= MAX_PB_REPS) || !(cents > 0)) return null;
  return { reps, cents };
}

/**
 * Whether a set will be a PB once saved: strictly heavier than the bar for
 * its reps and than every other set of the exercise in this workout that
 * shows a trophy. null when the bars are unknown (no guess); the save
 * response decides either way.
 */
export function predictPb(
  set: PbLift,
  bars: PbBars | null | undefined,
  isMaxTrackable: boolean,
  otherPbs: PbLift[],
): boolean | null {
  const lift = qualifyingLift(set, isMaxTrackable);
  if (!lift) return false;
  if (!bars) return null;
  const bar = bars[lift.reps as 1 | 2 | 3];
  if (bar !== null && bar !== undefined && lift.cents <= toCents(bar)) return false;
  return otherPbs.every((other) => {
    // Same exercise as the set, which passed the max-trackable check above
    const o = qualifyingLift(other, true);
    return !o || o.reps !== lift.reps || lift.cents > o.cents;
  });
}
