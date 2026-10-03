import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { WorkoutService } from './workout.service';
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

  describe('deleteWorkout', () => {
    it('sends a DELETE request to /workouts/:id', () => {
      service.deleteWorkout('abc123').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/workouts/abc123`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
