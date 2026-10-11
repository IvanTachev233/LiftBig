import { localDay } from '../../core/local-date';
import { Workout, WorkoutCard, WorkoutSet } from '../../core/workout.service';
import { StatusPillKind } from './status-pill.component';

export interface StatusLabel {
  kind: StatusPillKind;
  text: string;
}

/**
 * The status word for a workout (spec § Status words). A planned workout is
 * Today / Planned / Missed for the athlete by the device's calendar day, and
 * Not started for the coach. Nothing about "Missed" is stored.
 */
export function workoutStatusLabel(
  workout: Pick<Workout, 'status' | 'date'>,
  role: 'CLIENT' | 'COACH',
  today: Date = new Date(),
): StatusLabel {
  const coach = role === 'COACH';
  switch (workout.status) {
    case 'COMPLETED':
      return { kind: 'done', text: coach ? 'Completed' : 'Done' };
    case 'IN_PROGRESS':
      return { kind: 'in-progress', text: 'In progress' };
  }
  if (coach) return { kind: 'planned', text: 'Not started' };
  // The workout's calendar day is its date part; today is the device's
  const day = workout.date.slice(0, 10);
  const now = localDay(today);
  if (day === now) return { kind: 'today', text: 'Today' };
  return day > now ? { kind: 'planned', text: 'Planned' } : { kind: 'missed', text: 'Missed' };
}

/**
 * Deleting asks first for a completed workout or one with a logged set;
 * planned, missed and empty workouts go straight to the undo toast.
 */
export function needsDeleteConfirm(workout: Pick<Workout, 'status' | 'exercises'>): boolean {
  return (
    workout.status === 'COMPLETED' ||
    (workout.exercises ?? []).some((card) => card.sets.some((set) => set.made !== null))
  );
}

/**
 * "Includes your Bench Press PR · 123 kg" for the workout's first personal
 * best set (", and 1 more" when there are others); undefined without one.
 * `format` turns kg into the user's unit.
 */
export function prWarning(
  workout: Pick<Workout, 'exercises'>,
  format: (kg: number) => string,
): string | undefined {
  const prs: { card: WorkoutCard; set: WorkoutSet }[] = [];
  for (const card of workout.exercises ?? []) {
    for (const set of card.sets) if (set.pb) prs.push({ card, set });
  }
  const [first] = prs;
  if (!first) return undefined;
  const kg = first.set.actualWeight ?? first.set.weight;
  const name = first.card.exercise?.name ?? 'exercise';
  const more = prs.length > 1 ? `, and ${prs.length - 1} more` : '';
  return `Includes your ${name} PR${kg == null ? '' : ' · ' + format(kg)}${more}`;
}
