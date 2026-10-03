import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  CreateExerciseDto,
  Exercise,
  WorkoutService,
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

  describe('deleteWorkout', () => {
    it('sends a DELETE request to /workouts/:id', () => {
      service.deleteWorkout('abc123').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/workouts/abc123`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
