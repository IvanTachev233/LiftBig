import { Workout, WorkoutStatus } from '../../core/workout.service';
import { StatusPillKind } from './status-pill.component';
import { workoutStatusLabel } from './workout-status';

const workout = (status: WorkoutStatus, date: string): Workout => ({
  id: 'w1',
  name: 'Day 1',
  date: `${date}T00:00:00.000Z`,
  status,
  totalWeightLifted: 0,
  assignedById: null,
  assignedBy: null,
  exercises: [],
});

describe('workoutStatusLabel', () => {
  // 23:59 local on 13 Oct 2026; west of UTC the UTC day is already the 14th
  const today = new Date(2026, 9, 13, 23, 59, 30);

  const cases: [WorkoutStatus, string, 'CLIENT' | 'COACH', StatusPillKind, string][] = [
    ['COMPLETED', '2026-10-01', 'CLIENT', 'done', 'Done'],
    ['COMPLETED', '2026-10-01', 'COACH', 'done', 'Completed'],
    ['IN_PROGRESS', '2026-10-01', 'CLIENT', 'in-progress', 'In progress'],
    ['IN_PROGRESS', '2026-10-01', 'COACH', 'in-progress', 'In progress'],
    ['PLANNED', '2026-10-13', 'CLIENT', 'today', 'Today'],
    ['PLANNED', '2026-10-14', 'CLIENT', 'planned', 'Planned'],
    ['PLANNED', '2026-10-12', 'CLIENT', 'missed', 'Missed'],
    ['PLANNED', '2026-10-13', 'COACH', 'planned', 'Not started'],
    ['PLANNED', '2026-10-14', 'COACH', 'planned', 'Not started'],
    ['PLANNED', '2026-10-12', 'COACH', 'planned', 'Not started'],
    // A finished or started workout keeps its status on any date
    ['COMPLETED', '2026-10-20', 'CLIENT', 'done', 'Done'],
    ['IN_PROGRESS', '2026-10-13', 'CLIENT', 'in-progress', 'In progress'],
  ];

  for (const [status, date, role, kind, text] of cases) {
    it(`${role} sees "${text}" for ${status} on ${date}`, () => {
      expect(workoutStatusLabel(workout(status, date), role, today)).toEqual({ kind, text });
    });
  }

  it('compares with the local calendar day, not the UTC day', () => {
    // Just after local midnight; east of UTC the UTC day is still the 13th
    const justAfterMidnight = new Date(2026, 9, 14, 0, 0, 30);
    expect(workoutStatusLabel(workout('PLANNED', '2026-10-14'), 'CLIENT', justAfterMidnight).text).toBe(
      'Today',
    );
    expect(workoutStatusLabel(workout('PLANNED', '2026-10-13'), 'CLIENT', justAfterMidnight).text).toBe(
      'Missed',
    );
  });

  describe('with the clock at 23:59 local', () => {
    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(today);
    });

    afterEach(() => jasmine.clock().uninstall());

    it('defaults to the current day', () => {
      expect(workoutStatusLabel(workout('PLANNED', '2026-10-13'), 'CLIENT').text).toBe('Today');
      expect(workoutStatusLabel(workout('PLANNED', '2026-10-12'), 'CLIENT').text).toBe('Missed');
      expect(workoutStatusLabel(workout('PLANNED', '2026-10-14'), 'CLIENT').text).toBe('Planned');
    });
  });
});
