import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { ActiveWorkoutService } from './active-workout.service';
import { AuthService, User } from './auth.service';
import { OutboxService } from './outbox.service';
import { FakeOutboxPlatform, InstantOutbox } from './outbox.testing';
import { OUTBOX_PLATFORM } from './outbox.service';
import { ReadCacheService } from './read-cache.service';
import { WorkoutCopyService } from './workout-copy.service';
import { Workout, WorkoutStatus } from './workout.service';

const listed = (id: string, status: WorkoutStatus, date: string): Workout => ({
  id,
  name: id,
  date,
  status,
  totalWeightLifted: 0,
  assignedById: null,
  assignedBy: null,
  exercises: [],
});

describe('ActiveWorkoutService', () => {
  const url = `${environment.apiUrl}/workouts`;
  let service: ActiveWorkoutService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OutboxService, useClass: InstantOutbox },
        { provide: OUTBOX_PLATFORM, useValue: new FakeOutboxPlatform() },
      ],
    });
    service = TestBed.inject(ActiveWorkoutService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  // Tokens carry the user as sub + email, like the API's
  const signIn = (role: User['role'], email = 'u@x.io') => {
    const payload = btoa(JSON.stringify({ sub: 'u1', email, role }));
    TestBed.inject(AuthService).setSession(`header.${payload}.signature`);
  };

  it('is empty before the first refresh', () => {
    signIn('CLIENT');
    expect(service.workout()).toBeNull();
  });

  it("exposes the athlete's newest IN_PROGRESS workout", () => {
    signIn('CLIENT');
    service.refresh();
    http.expectOne(url).flush([
      listed('done', 'COMPLETED', '2026-10-09T08:00:00.000Z'),
      listed('older', 'IN_PROGRESS', '2026-10-01T08:00:00.000Z'),
      listed('newest', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z'),
      listed('planned', 'PLANNED', '2026-10-12'),
    ]);
    expect(service.workout()?.id).toBe('newest');
  });

  it('is empty when nothing is in progress', () => {
    signIn('CLIENT');
    service.refresh();
    http.expectOne(url).flush([listed('done', 'COMPLETED', '2026-10-09T08:00:00.000Z')]);
    expect(service.workout()).toBeNull();
  });

  it('never loads for a coach', () => {
    signIn('COACH');
    service.refresh();
    http.expectNone(url);
    expect(service.workout()).toBeNull();
  });

  it('forgets the workout on sign-out and for another athlete', () => {
    signIn('CLIENT');
    service.refresh();
    http.expectOne(url).flush([listed('w1', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z')]);
    expect(service.workout()?.id).toBe('w1');

    signIn('CLIENT', 'other@x.io');
    expect(service.workout()).toBeNull();

    TestBed.inject(AuthService).logout();
    expect(service.workout()).toBeNull();
  });

  it('keeps the workout when a refresh fails', () => {
    signIn('CLIENT');
    service.refresh();
    http.expectOne(url).flush([listed('w1', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z')]);
    service.refresh();
    http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
    expect(service.workout()?.id).toBe('w1');
  });

  it('hides a completed workout at once, and a list loaded before completion does not bring it back', () => {
    signIn('CLIENT');
    service.refresh();
    http.expectOne(url).flush([listed('w1', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z')]);

    service.refresh();
    const stale = http.expectOne(url);
    service.completed('w1');
    expect(service.workout()).toBeNull();

    expect(stale.cancelled).toBe(true);
    expect(service.workout()).toBeNull();
  });

  it('ignores completion of another workout', () => {
    signIn('CLIENT');
    service.refresh();
    http.expectOne(url).flush([listed('w1', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z')]);
    service.completed('w2');
    expect(service.workout()?.id).toBe('w1');
  });

  describe('with changes waiting on this phone', () => {
    /** The device copy of a workout plus a change that can't be sent yet */
    const queue = (workout: Workout) => {
      const outbox = TestBed.inject(OutboxService) as unknown as InstantOutbox;
      outbox.online.set(false);
      TestBed.inject(WorkoutCopyService).save(workout);
      void outbox.enqueue({ method: 'PATCH', path: `/workouts/${workout.id}`, body: {}, workoutId: workout.id, label: 'x' });
    };

    it("shows a workout started on this phone that the API hasn't seen yet", () => {
      signIn('CLIENT');
      service.refresh();
      http.expectOne(url).flush([listed('w1', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z')]);
      queue(listed('offline', 'IN_PROGRESS', '2026-10-09T08:00:00.000Z'));
      expect(service.workout()?.id).toBe('offline');
    });

    it('shows one before the first refresh, or when the refresh fails offline', () => {
      signIn('CLIENT');
      queue(listed('offline', 'IN_PROGRESS', '2026-10-09T08:00:00.000Z'));
      expect(service.workout()?.id).toBe('offline');
      service.refresh();
      http.expectOne(url).error(new ProgressEvent('error'));
      expect(service.workout()?.id).toBe('offline');
    });

    it('hides a workout finished on this phone while the API still has it in progress', () => {
      signIn('CLIENT');
      service.refresh();
      http.expectOne(url).flush([listed('w1', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z')]);
      queue(listed('w1', 'COMPLETED', '2026-10-08T08:00:00.000Z'));
      expect(service.workout()).toBeNull();
    });
  });

  it('shows the workout in progress from the list last loaded on this phone when there is no connection', async () => {
    await TestBed.inject(ReadCacheService).start();
    signIn('CLIENT');
    service.refresh();
    http.expectOne(url).flush([listed('w1', 'IN_PROGRESS', '2026-10-08T08:00:00.000Z')]);
    service.completed('w1');
    expect(service.workout()).toBeNull();

    service.refresh();
    http.expectOne(url).error(new ProgressEvent('error'), { status: 0, statusText: '' });
    expect(service.workout()?.id).toBe('w1');
  });

  it('uses only the newest of overlapping refreshes', () => {
    signIn('CLIENT');
    service.refresh();
    const first = http.expectOne(url);
    service.refresh();
    const second = http.match(url);
    expect(first.cancelled).toBe(true);
    second[0].flush([]);
    expect(service.workout()).toBeNull();
  });
});
