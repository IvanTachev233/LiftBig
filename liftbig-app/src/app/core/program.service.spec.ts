import { Enrollment, sessionPosition } from './program.service';
import { Workout } from './workout.service';

describe('sessionPosition', () => {
  function workout(id: string, date: string): Workout {
    return {
      id,
      name: id,
      date: `${date}T00:00:00.000Z`,
      status: 'PLANNED',
      totalWeightLifted: 0,
      assignedById: null,
      assignedBy: null,
      exercises: [],
    };
  }

  // Starts on a Wednesday: weeks count from the start date, not the calendar week
  const enrollment: Pick<Enrollment, 'startDate' | 'workouts'> = {
    startDate: '2026-01-07',
    workouts: [
      workout('w1-b', '2026-01-09'),
      workout('w1-a', '2026-01-07'),
      workout('w2-a', '2026-01-14'),
      workout('w2-b', '2026-01-16'),
      workout('w2-c', '2026-01-20'),
      workout('w3-a', '2026-01-21'),
    ],
  };

  it('gives the week from the start date and the day as the place in that week', () => {
    expect(sessionPosition(enrollment, 'w1-a')).toEqual({ week: 1, day: 1 });
    expect(sessionPosition(enrollment, 'w1-b')).toEqual({ week: 1, day: 2 });
    expect(sessionPosition(enrollment, 'w2-a')).toEqual({ week: 2, day: 1 });
    expect(sessionPosition(enrollment, 'w2-c')).toEqual({ week: 2, day: 3 });
    expect(sessionPosition(enrollment, 'w3-a')).toEqual({ week: 3, day: 1 });
  });

  it('gives null for a workout that is not in the enrollment', () => {
    expect(sessionPosition(enrollment, 'other')).toBeNull();
  });
});
