import { localDay } from '../../core/local-date';
import { Workout } from '../../core/workout.service';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface MonthGroup {
  // YYYY-MM
  key: string;
  label: string;
  workouts: Workout[];
}

function dayOf(workout: Pick<Workout, 'date'>): string {
  return workout.date.slice(0, 10);
}

/**
 * Workouts dated today or earlier, plus any that are under way or done, newest
 * first. Planned workouts still to come belong to Today and My program.
 */
export function historyWorkouts(workouts: Workout[], now: Date): Workout[] {
  const today = localDay(now);
  return workouts
    .filter((w) => w.status !== 'PLANNED' || dayOf(w) <= today)
    .sort((a, b) => dayOf(b).localeCompare(dayOf(a)));
}

/** Consecutive workouts by month; the year shows for months of other years */
export function monthGroups(workouts: Workout[], now: Date): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const workout of workouts) {
    const key = dayOf(workout).slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const [year, month] = key.split('-').map(Number);
      const label = MONTHS[month - 1] + (year === now.getFullYear() ? '' : ` ${year}`);
      group = { key, label, workouts: [] };
      groups.push(group);
    }
    group.workouts.push(workout);
  }
  return groups;
}

/** Sessions completed or under way in the current Monday–Sunday week, and their volume in kg */
export function weekTotals(workouts: Workout[], now: Date): { sessions: number; volumeKg: number } {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const [from, to] = [localDay(monday), localDay(sunday)];
  const inWeek = workouts.filter(
    (w) => w.status !== 'PLANNED' && dayOf(w) >= from && dayOf(w) <= to,
  );
  return {
    sessions: inWeek.length,
    volumeKg: inWeek.reduce((sum, w) => sum + (w.totalWeightLifted || 0), 0),
  };
}
