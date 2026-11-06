import { BestLift } from '../../core/lift.service';
import { localDay } from '../../core/local-date';
import { Workout, workoutSource } from '../../core/workout.service';
import { StripDay } from '../../shared/ui/week-strip.component';

export type { StripDay };

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A workout's calendar day: the date part of its date */
function dayOf(workout: Pick<Workout, 'date'>): string {
  return workout.date.slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** A YYYY-MM-DD day moved by whole days on the device calendar */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return localDay(new Date(year, month - 1, date + days));
}

/** Today card order: in progress, then program, then coach, then the rest */
function rank(workout: Workout): number {
  if (workout.status === 'IN_PROGRESS') return 0;
  const source = workoutSource(workout);
  return source === 'program' ? 1 : source === 'coach' ? 2 : 3;
}

/** "Morning, Alex" by the device's hour; "Good morning" without a name */
export function greeting(now: Date, name: string | null | undefined): string {
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part[0].toUpperCase()}${part.slice(1)}, ${first}` : `Good ${part}`;
}

/**
 * Monday to Sunday of the current week, or of the week `offset` weeks from
 * it. A day's dot: open when a workout is in progress or planned and past,
 * else done when one is completed, else planned when one is still to come.
 */
export function weekStrip(workouts: Workout[], now: Date, offset = 0): StripDay[] {
  const today = localDay(now);
  const monday = addDays(now, -((now.getDay() + 6) % 7) + offset * 7);
  return WEEKDAYS.map((weekday, i) => {
    const date = addDays(monday, i);
    const day = localDay(date);
    const onDay = workouts.filter((w) => dayOf(w) === day);
    let dot: StripDay['dot'] = null;
    if (
      onDay.some(
        (w) => w.status === 'IN_PROGRESS' || (w.status === 'PLANNED' && day < today),
      )
    ) {
      dot = 'open';
    } else if (onDay.some((w) => w.status === 'COMPLETED')) {
      dot = 'done';
    } else if (onDay.some((w) => w.status === 'PLANNED')) {
      dot = 'planned';
    }
    return { date: day, weekday, day: date.getDate(), today: day === today, dot };
  });
}

/** Every workout of a day in Today card order */
export function dayWorkouts(workouts: Workout[], day: string): Workout[] {
  return workouts.filter((w) => dayOf(w) === day).sort((a, b) => rank(a) - rank(b));
}

/** Today's open workouts in Today card order */
function openToday(workouts: Workout[], now: Date): Workout[] {
  return dayWorkouts(workouts, localDay(now)).filter((w) => w.status !== 'COMPLETED');
}

/** Today's workout to start: in progress, then program, then coach, then other planned */
export function todayWorkout(workouts: Workout[], now: Date): Workout | null {
  return openToday(workouts, now)[0] ?? null;
}

/** Today's other open workouts, listed under the Today card */
export function todayOthers(workouts: Workout[], now: Date): Workout[] {
  return openToday(workouts, now).slice(1);
}

/**
 * A day panel workout's button: View a completed one, Resume one in
 * progress, Start one planned today, else Start today (moves it to today)
 */
export type DayAction = 'view' | 'resume' | 'start' | 'start-today';

export function dayAction(workout: Workout, now: Date): DayAction {
  if (workout.status === 'COMPLETED') return 'view';
  if (workout.status === 'IN_PROGRESS') return 'resume';
  return dayOf(workout) === localDay(now) ? 'start' : 'start-today';
}

/** The text of a day without workouts */
export function emptyDayText(day: string, now: Date): 'Rest day' | 'Nothing planned' {
  return day > localDay(now) ? 'Nothing planned' : 'Rest day';
}

/** The next planned workouts after today, soonest first */
export function upNext(workouts: Workout[], now: Date, count = 2): Workout[] {
  const today = localDay(now);
  return workouts
    .filter((w) => w.status === 'PLANNED' && dayOf(w) > today)
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)))
    .slice(0, count);
}

/** The newest best achieved in the last 14 days; 1RMs entered for a program don't count */
export function recentPr(bests: BestLift[], now: Date): BestLift | null {
  const since = localDay(addDays(now, -14));
  const recent = bests
    .filter((b) => b.source !== 'PROGRAM_SETUP' && b.achievedOn >= since)
    .sort((a, b) => b.achievedOn.localeCompare(a.achievedOn));
  return recent[0] ?? null;
}
