import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  CoachCardInput,
  CoachWorkoutService,
  CreateCoachWorkoutRequest,
} from './coach-workout.service';
import { Workout, WorkoutCard } from './workout.service';
import { environment } from '../../environments/environment';

describe('CoachWorkoutService', () => {
  let service: CoachWorkoutService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/coach`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CoachWorkoutService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Cards as loaded from the API, results included.
  const loadedCards: WorkoutCard[] = [
    {
      id: 'card-1',
      workoutId: 'w1',
      exerciseId: 'e1',
      exercise: { id: 'e1', name: 'Squat' },
      order: 1,
      supersetGroup: 'g1',
      sets: [
        {
          id: 's1',
          workoutExerciseId: 'card-1',
          reps: 5,
          weight: 100,
          order: 1,
          made: true,
          actualReps: 4,
          actualWeight: 105,
          notes: 'pause',
        },
      ],
    },
  ];

  it('lists the workouts assigned to a client', () => {
    let result: Workout[] | undefined;
    service.getClientWorkouts('c1').subscribe((list) => (result = list));

    const req = httpMock.expectOne({
      method: 'GET',
      url: `${api}/clients/c1/workouts`,
    });
    req.flush([]);
    expect(result).toEqual([]);
  });

  it('creates a workout for a client with the planned cards', () => {
    const body: CreateCoachWorkoutRequest = {
      name: 'Week 1',
      date: '2030-03-01',
      exercises: [
        {
          exerciseId: 'e1',
          order: 1,
          supersetGroup: null,
          sets: [{ reps: 5, weight: null, notes: null, order: 1 }],
        },
      ],
    };
    service.createWorkout('c1', body).subscribe();

    const req = httpMock.expectOne({
      method: 'POST',
      url: `${api}/clients/c1/workouts`,
    });
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('gets and deletes one assigned workout', () => {
    service.getWorkout('w1').subscribe();
    httpMock.expectOne({ method: 'GET', url: `${api}/workouts/w1` }).flush({});

    service.deleteWorkout('w1').subscribe();
    httpMock
      .expectOne({ method: 'DELETE', url: `${api}/workouts/w1` })
      .flush(null);
  });

  it('PUTs the plan with card and set ids and never a result field', () => {
    service
      .updateWorkout('w1', {
        name: 'Renamed',
        exercises: loadedCards as unknown as CoachCardInput[],
      })
      .subscribe();

    const req = httpMock.expectOne({ method: 'PUT', url: `${api}/workouts/w1` });
    expect(req.request.body).toEqual({
      name: 'Renamed',
      exercises: [
        {
          id: 'card-1',
          exerciseId: 'e1',
          order: 1,
          supersetGroup: 'g1',
          sets: [{ id: 's1', reps: 5, weight: 100, notes: 'pause', order: 1 }],
        },
      ],
    });
    const json = JSON.stringify(req.request.body);
    for (const key of ['made', 'actualReps', 'actualWeight', 'status']) {
      expect(json).not.toContain(`"${key}"`);
    }
    req.flush({});
  });

  it('PUTs a body without exercises as it is', () => {
    service.updateWorkout('w1', { date: '2030-04-01' }).subscribe();

    const req = httpMock.expectOne(`${api}/workouts/w1`);
    expect(req.request.body).toEqual({ date: '2030-04-01' });
    req.flush({});
  });
});
