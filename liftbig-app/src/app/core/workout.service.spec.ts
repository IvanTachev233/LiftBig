import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  CreateExerciseDto,
  Exercise,
  SetResultRequest,
  UpdateWorkoutRequest,
  Workout,
  WorkoutService,
  WorkoutSet,
} from './workout.service';
import { environment } from '../../environments/environment';

describe('WorkoutService', () => {
  let service: WorkoutService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WorkoutService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getExercises', () => {
    it('sends a GET request to /workouts/exercises and returns the typed list', () => {
      const exercises: Exercise[] = [
        { id: 'e1', name: 'Bench Press', videoUrl: null, createdById: null },
        { id: 'e2', name: 'Squat', description: 'Back squat' },
      ];
      let result: Exercise[] | undefined;

      service.getExercises().subscribe((list) => (result = list));

      const req = httpMock.expectOne(`${environment.apiUrl}/workouts/exercises`);
      expect(req.request.method).toBe('GET');
      req.flush(exercises);

      expect(result).toEqual(exercises);
    });
  });

  describe('createExercise', () => {
    it('sends a POST request to /workouts/exercises with the body', () => {
      const dto: CreateExerciseDto = {
        name: 'Zercher Squat',
        description: 'Bar in the elbows',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      };
      const created: Exercise = { id: 'new-1', ...dto, createdById: 'coach-1' };
      let result: Exercise | undefined;

      service.createExercise(dto).subscribe((exercise) => (result = exercise));

      const req = httpMock.expectOne(`${environment.apiUrl}/workouts/exercises`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);
      req.flush(created, { status: 201, statusText: 'Created' });

      expect(result).toEqual(created);
    });
  });

  describe('getWorkout', () => {
    it('sends a GET request to /workouts/:id and returns the workout with its cards', () => {
      const workout: Workout = {
        id: 'w1',
        userId: 'u1',
        name: 'Push day',
        date: '2026-10-03T00:00:00.000Z',
        notes: null,
        isTemplate: false,
        status: 'IN_PROGRESS',
        totalWeightLifted: 1000,
        assignedById: 'coach-1',
        assignedBy: { id: 'coach-1', name: 'Coach Carter' },
        exercises: [
          {
            id: 'card-1',
            workoutId: 'w1',
            exerciseId: 'e1',
            exercise: { id: 'e1', name: 'Bench Press' },
            order: 1,
            supersetGroup: null,
            sets: [
              { id: 's1', workoutExerciseId: 'card-1', reps: 5, weight: 100, order: 1, made: true, actualReps: 4, actualWeight: 102.5, notes: 'pause' },
              { id: 's2', workoutExerciseId: 'card-1', reps: 5, weight: null, order: 2, made: null, actualReps: null, actualWeight: null, notes: null },
            ],
          },
          {
            id: 'card-2',
            workoutId: 'w1',
            exerciseId: 'e1',
            exercise: { id: 'e1', name: 'Bench Press' },
            order: 2,
            supersetGroup: null,
            sets: [{ id: 's3', workoutExerciseId: 'card-2', reps: 8, weight: 80, order: 1, made: false, actualReps: null, actualWeight: null, notes: null }],
          },
        ],
      };
      let result: Workout | undefined;

      service.getWorkout('w1').subscribe((w) => (result = w));

      const req = httpMock.expectOne({ method: 'GET', url: `${environment.apiUrl}/workouts/w1` });
      req.flush(workout);

      expect(result).toEqual(workout);
      expect(result?.exercises.length).toBe(2);
      expect(result?.exercises[1].sets[0].reps).toBe(8);
      expect(result?.assignedBy?.name).toBe('Coach Carter');
    });
  });

  describe('updateWorkout', () => {
    it('sends a PATCH request to /workouts/:id with the nested cards body', () => {
      const body: UpdateWorkoutRequest = {
        status: 'COMPLETED',
        exercises: [
          {
            id: 'card-1',
            exerciseId: 'e1',
            order: 1,
            supersetGroup: 'a1b2c3d4-0000-4000-8000-000000000001',
            sets: [
              { id: 's1', reps: 5, weight: 100, order: 1, made: true },
              { reps: 5, weight: 100, order: 2 },
            ],
          },
          {
            exerciseId: 'e1',
            order: 2,
            supersetGroup: 'a1b2c3d4-0000-4000-8000-000000000001',
            sets: [{ reps: 10, weight: 60 }],
          },
        ],
      };
      let result: Workout | undefined;

      service.updateWorkout('w1', body).subscribe((w) => (result = w));

      const req = httpMock.expectOne({ method: 'PATCH', url: `${environment.apiUrl}/workouts/w1` });
      expect(req.request.body).toEqual(body);
      const saved = { id: 'w1', exercises: [] } as unknown as Workout;
      req.flush(saved);

      expect(result).toEqual(saved);
    });

    it('sends a name-only PATCH without an exercises key', () => {
      service.updateWorkout('w1', { name: 'Renamed' }).subscribe();

      const req = httpMock.expectOne({ method: 'PATCH', url: `${environment.apiUrl}/workouts/w1` });
      expect(req.request.body).toEqual({ name: 'Renamed' });
      expect('exercises' in req.request.body).toBeFalse();
      req.flush({});
    });
  });

  describe('addSet', () => {
    it('sends a POST to /workouts/:id/cards/:cardId/sets with the set', () => {
      let result: WorkoutSet | undefined;
      service
        .addSet('w1', 'card-1', { reps: 5, weight: null, made: true, actualReps: 4 })
        .subscribe((set) => (result = set));

      const req = httpMock.expectOne({
        method: 'POST',
        url: `${environment.apiUrl}/workouts/w1/cards/card-1/sets`,
      });
      expect(req.request.body).toEqual({ reps: 5, weight: null, made: true, actualReps: 4 });
      const created = { id: 's9', reps: 5, order: 3 } as WorkoutSet;
      req.flush(created, { status: 201, statusText: 'Created' });
      expect(result).toEqual(created);
    });
  });

  describe('updateSetResult', () => {
    it('sends a PATCH to /workouts/:id/sets/:setId with only the result fields', () => {
      service
        .updateSetResult('w1', 's1', { actualReps: 3, actualWeight: 105, made: true })
        .subscribe();

      const req = httpMock.expectOne({
        method: 'PATCH',
        url: `${environment.apiUrl}/workouts/w1/sets/s1`,
      });
      expect(req.request.body).toEqual({ actualReps: 3, actualWeight: 105, made: true });
      req.flush({});
    });

    it('drops planned fields a caller passes along', () => {
      const body = { made: false, reps: 5, weight: 100 } as SetResultRequest;
      service.updateSetResult('w1', 's1', body).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/workouts/w1/sets/s1`);
      expect(req.request.body).toEqual({ made: false });
      req.flush({});
    });
  });

  describe('deleteWorkout', () => {
    it('sends a DELETE request to /workouts/:id', () => {
      service.deleteWorkout('abc123').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/workouts/abc123`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
