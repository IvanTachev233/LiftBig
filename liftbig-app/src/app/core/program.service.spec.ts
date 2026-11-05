import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { Enrollment, ProgramService, sessionPosition } from './program.service';
import { ReadCacheService } from './read-cache.service';
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

// The read cache keeps the workout list shown without a connection; a program
// change deletes planned sessions, so the cache must drop them too
describe('ProgramService program changes and the read cache', () => {
  const api = `${environment.apiUrl}/program-enrollments`;
  let service: ProgramService;
  let http: HttpTestingController;
  let cache: jasmine.SpyObj<ReadCacheService>;

  beforeEach(() => {
    cache = jasmine.createSpyObj<ReadCacheService>('ReadCacheService', [
      'programChanged',
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReadCacheService, useValue: cache },
      ],
    });
    service = TestBed.inject(ProgramService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('a started program becomes the only one whose planned sessions are kept', () => {
    service
      .enroll({ programId: 'p1', startDate: '2026-11-05', maxes: [] })
      .subscribe();
    expect(cache.programChanged).not.toHaveBeenCalled();
    http.expectOne(api).flush({ id: 'e2', status: 'ACTIVE' });
    expect(cache.programChanged).toHaveBeenCalledOnceWith('e2');
  });

  it('an abandoned program leaves no planned sessions', () => {
    service.abandon('e1').subscribe();
    http
      .expectOne(`${api}/e1/abandon`)
      .flush({ id: 'e1', status: 'ABANDONED' });
    expect(cache.programChanged).toHaveBeenCalledOnceWith(null);
  });

  it('a failed start or abandon changes nothing', () => {
    service
      .enroll({ programId: 'p1', startDate: '2026-11-05', maxes: [] })
      .subscribe({ error: () => undefined });
    http.expectOne(api).flush({}, { status: 409, statusText: 'Conflict' });
    service.abandon('e1').subscribe({ error: () => undefined });
    http
      .expectOne(`${api}/e1/abandon`)
      .error(new ProgressEvent('error'), { status: 0, statusText: '' });
    expect(cache.programChanged).not.toHaveBeenCalled();
  });
});
