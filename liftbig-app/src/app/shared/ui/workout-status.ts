import { localDay } from '../../core/local-date';
import { Workout } from '../../core/workout.service';
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
