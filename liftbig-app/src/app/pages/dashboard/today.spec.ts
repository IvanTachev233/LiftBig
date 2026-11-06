import { BestLift } from '../../core/lift.service';
import { Workout, WorkoutStatus, WorkoutSource } from '../../core/workout.service';
import {
  dayAction,
  dayWorkouts,
  emptyDayText,
  greeting,
  recentPr,
  shiftDay,
  todayOthers,
  todayWorkout,
  upNext,
  weekStrip,
} from './today';

// Saturday 10 Oct 2026, a minute before midnight on the device
const NOW = new Date(2026, 9, 10, 23, 59);

function workout(
  id: string,
  day: string,
  status: WorkoutStatus = 'PLANNED',
  source: WorkoutSource = 'manual',
): Workout {
  return {
    id,
    name: id,
    date: `${day}T00:00:00.000Z`,
    status,
    totalWeightLifted: 0,
    assignedById: source === 'coach' ? 'coach1' : null,
    assignedBy: source === 'coach' ? { id: 'coach1', name: 'Kim' } : null,
    source,
    exercises: [],
  };
}

describe('Today rules', () => {
  describe('greeting', () => {
    it('greets by the time of day with the first name, or alone without a name', () => {
      expect(greeting(new Date(2026, 9, 10, 8), 'Alex Rivera')).toBe('Morning, Alex');
      expect(greeting(new Date(2026, 9, 10, 13), 'Alex')).toBe('Afternoon, Alex');
      expect(greeting(NOW, 'Alex')).toBe('Evening, Alex');
      expect(greeting(NOW, null)).toBe('Good evening');
      expect(greeting(new Date(2026, 9, 10, 4), '  ')).toBe('Good morning');
    });
  });

  describe('week strip', () => {
    it('runs Monday to Sunday of the current week with the dots of the spec', () => {
      const strip = weekStrip(
        [
          workout('done', '2026-10-05', 'COMPLETED'),
          workout('missed', '2026-10-07'),
          workout('started', '2026-10-08', 'IN_PROGRESS'),
          // A completed and a missed one the same day: the open one shows
          workout('done-too', '2026-10-09', 'COMPLETED'),
          workout('missed-too', '2026-10-09'),
          workout('today', '2026-10-10'),
          workout('tomorrow', '2026-10-11'),
          workout('next-week', '2026-10-12'),
        ],
        NOW,
      );

      expect(strip.map((d) => [d.weekday, d.day, d.today, d.dot])).toEqual([
        ['M', 5, false, 'done'],
        ['T', 6, false, null],
        ['W', 7, false, 'open'],
        ['T', 8, false, 'open'],
        ['F', 9, false, 'open'],
        ['S', 10, true, 'planned'],
        ['S', 11, false, 'planned'],
      ]);
    });

    it('a Sunday belongs to the week that started the Monday before', () => {
      const strip = weekStrip([], new Date(2026, 9, 11, 0, 1));
      expect(strip[0].date).toBe('2026-10-05');
      expect(strip[6].today).toBeTrue();
    });
  });

  describe('other weeks', () => {
    const workouts = [
      workout('missed', '2026-09-30'),
      workout('done', '2026-10-01', 'COMPLETED'),
      workout('started', '2026-10-02', 'IN_PROGRESS'),
      workout('coming', '2026-10-13'),
      workout('coming-done', '2026-10-15', 'COMPLETED'),
    ];

    it('shows the week before with its dots and no today', () => {
      const strip = weekStrip(workouts, NOW, -1);
      expect(strip.map((d) => [d.date, d.today, d.dot])).toEqual([
        ['2026-09-28', false, null],
        ['2026-09-29', false, null],
        ['2026-09-30', false, 'open'],
        ['2026-10-01', false, 'done'],
        ['2026-10-02', false, 'open'],
        ['2026-10-03', false, null],
        ['2026-10-04', false, null],
      ]);
    });

    it('shows the week after with its dots and no today', () => {
      const strip = weekStrip(workouts, NOW, 1);
      expect(strip.map((d) => [d.weekday, d.day, d.today, d.dot])).toEqual([
        ['M', 12, false, null],
        ['T', 13, false, 'planned'],
        ['W', 14, false, null],
        ['T', 15, false, 'done'],
        ['F', 16, false, null],
        ['S', 17, false, null],
        ['S', 18, false, null],
      ]);
    });

    it('runs across a month and a year end', () => {
      // Wednesday 30 Dec 2026
      const now = new Date(2026, 11, 30, 12, 0);
      expect(weekStrip([], now).map((d) => d.day)).toEqual([28, 29, 30, 31, 1, 2, 3]);
      expect(weekStrip([], now)[6].date).toBe('2027-01-03');
      expect(weekStrip([], now, 1)[0].date).toBe('2027-01-04');
      expect(weekStrip([], now, -9)[0].date).toBe('2026-10-26');
      expect(weekStrip([], now, -9).map((d) => d.day)).toEqual([26, 27, 28, 29, 30, 31, 1]);
    });

    it('moves a day by whole days, the same weekday a week on, across month, year and clock changes', () => {
      expect(shiftDay('2026-10-21', 7)).toBe('2026-10-28');
      expect(shiftDay('2026-03-27', 7)).toBe('2026-04-03');
      expect(shiftDay('2026-12-29', 7)).toBe('2027-01-05');
      expect(shiftDay('2027-01-05', -7)).toBe('2026-12-29');
      expect(shiftDay('2026-10-10', 0)).toBe('2026-10-10');
    });
  });

  describe('day panel', () => {
    it("lists a day's workouts as the Today card picks: in progress, program, coach, other", () => {
      const list = dayWorkouts(
        [
          workout('own-done', '2026-10-07', 'COMPLETED'),
          workout('coach', '2026-10-07', 'PLANNED', 'coach'),
          workout('other-day', '2026-10-08', 'IN_PROGRESS'),
          workout('program', '2026-10-07', 'COMPLETED', 'program'),
          workout('started', '2026-10-07', 'IN_PROGRESS'),
        ],
        '2026-10-07',
      );
      expect(list.map((w) => w.id)).toEqual(['started', 'program', 'coach', 'own-done']);
    });

    it('gives each workout its action by status and day', () => {
      const action = (day: string, status: WorkoutStatus) => dayAction(workout('w', day, status), NOW);
      expect(action('2026-10-07', 'COMPLETED')).toBe('view');
      expect(action('2026-10-13', 'COMPLETED')).toBe('view');
      expect(action('2026-10-07', 'IN_PROGRESS')).toBe('resume');
      expect(action('2026-10-07', 'PLANNED')).toBe('start-today');
      expect(action('2026-10-13', 'PLANNED')).toBe('start-today');
      expect(action('2026-10-10', 'PLANNED')).toBe('start');
    });

    it('says Rest day on an empty past day and Nothing planned on an empty future one', () => {
      expect(emptyDayText('2026-10-09', NOW)).toBe('Rest day');
      expect(emptyDayText('2026-09-01', NOW)).toBe('Rest day');
      expect(emptyDayText('2026-10-11', NOW)).toBe('Nothing planned');
      expect(emptyDayText('2026-10-10', NOW)).toBe('Rest day');
    });

    it("lists today's other open workouts under the Today card, in its order", () => {
      const workouts = [
        workout('own', '2026-10-10'),
        workout('done', '2026-10-10', 'COMPLETED'),
        workout('coach', '2026-10-10', 'PLANNED', 'coach'),
        workout('started', '2026-10-10', 'IN_PROGRESS'),
        workout('tomorrow', '2026-10-11'),
      ];
      expect(todayWorkout(workouts, NOW)?.id).toBe('started');
      expect(todayOthers(workouts, NOW).map((w) => w.id)).toEqual(['coach', 'own']);
      expect(todayOthers([workout('own', '2026-10-10')], NOW)).toEqual([]);
    });
  });

  describe('today card', () => {
    it('picks in progress, then program, then coach, then other planned workouts of today', () => {
      const own = workout('own', '2026-10-10');
      const coach = workout('coach', '2026-10-10', 'PLANNED', 'coach');
      const program = workout('program', '2026-10-10', 'PLANNED', 'program');
      const started = workout('started', '2026-10-10', 'IN_PROGRESS');

      expect(todayWorkout([own, coach, program, started], NOW)?.id).toBe('started');
      expect(todayWorkout([own, coach, program], NOW)?.id).toBe('program');
      expect(todayWorkout([own, coach], NOW)?.id).toBe('coach');
      expect(todayWorkout([own], NOW)?.id).toBe('own');
    });

    it('leaves out completed workouts and other days', () => {
      expect(
        todayWorkout(
          [
            workout('done', '2026-10-10', 'COMPLETED'),
            workout('yesterday', '2026-10-09', 'IN_PROGRESS'),
            workout('tomorrow', '2026-10-11'),
          ],
          NOW,
        ),
      ).toBeNull();
    });
  });

  describe('up next', () => {
    it('takes the next two planned workouts after today, soonest first', () => {
      const next = upNext(
        [
          workout('later', '2026-10-20'),
          workout('today', '2026-10-10'),
          workout('started-tomorrow', '2026-10-11', 'IN_PROGRESS'),
          workout('tomorrow', '2026-10-11'),
          workout('past', '2026-10-01'),
          workout('monday', '2026-10-12'),
        ],
        NOW,
      );
      expect(next.map((w) => w.id)).toEqual(['tomorrow', 'monday']);
    });
  });

  describe('PR banner', () => {
    function best(exerciseId: string, achievedOn: string, source: BestLift['source'] = 'LOGGED_SET'): BestLift {
      return { exerciseId, weightKg: 100, unit: 'kg', achievedOn, source };
    }

    it('is the newest best of the last 14 days', () => {
      expect(
        recentPr([best('a', '2026-09-30'), best('b', '2026-10-08'), best('c', '2026-10-02')], NOW)
          ?.exerciseId,
      ).toBe('b');
    });

    it('counts the day 14 days back, not the day before it', () => {
      expect(recentPr([best('a', '2026-09-26')], NOW)?.exerciseId).toBe('a');
      expect(recentPr([best('a', '2026-09-25')], NOW)).toBeNull();
    });

    it('leaves out 1RMs entered when starting a program', () => {
      expect(recentPr([best('a', '2026-10-09', 'PROGRAM_SETUP')], NOW)).toBeNull();
    });
  });
});
