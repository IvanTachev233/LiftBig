import { BestLift } from '../../core/lift.service';
import { Workout, WorkoutStatus, WorkoutSource } from '../../core/workout.service';
import { greeting, recentPr, todayWorkout, upNext, weekStrip } from './today';

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
