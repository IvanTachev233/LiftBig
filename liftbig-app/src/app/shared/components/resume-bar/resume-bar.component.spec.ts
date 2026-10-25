import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { ActiveWorkoutService } from '../../../core/active-workout.service';
import { AuthService } from '../../../core/auth.service';
import { fakeToken } from '../../../core/auth.testing';
import { OutboxService } from '../../../core/outbox.service';
import { FakeOutboxPlatform, InstantOutbox } from '../../../core/outbox.testing';
import { OUTBOX_PLATFORM } from '../../../core/outbox.service';
import { WorkoutCopyService } from '../../../core/workout-copy.service';
import { Workout, WorkoutStatus } from '../../../core/workout.service';
import { ResumeBarComponent } from './resume-bar.component';

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

describe('ResumeBarComponent', () => {
  let fixture: ComponentFixture<ResumeBarComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ResumeBarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OutboxService, useClass: InstantOutbox },
        { provide: OUTBOX_PLATFORM, useValue: new FakeOutboxPlatform() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).setSession(fakeToken('CLIENT'));
    fixture = TestBed.createComponent(ResumeBarComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  const bar = () => fixture.nativeElement.querySelector('.resume-bar') as HTMLElement | null;

  function load(workouts: Workout[]) {
    TestBed.inject(ActiveWorkoutService).refresh();
    http.expectOne(`${environment.apiUrl}/workouts`).flush(workouts);
    fixture.detectChanges();
  }

  it('is hidden with no workout in progress', () => {
    load([listed('done', 'COMPLETED', '2026-10-09T08:00:00.000Z')]);
    expect(bar()).toBeNull();
  });

  it('shows the workout in progress with its start day', () => {
    load([listed('w1', 'IN_PROGRESS', '2026-10-09T12:00:00')]);
    expect(bar()?.textContent).toContain('Workout in progress');
    expect(bar()?.textContent).toContain('Started Fri 9 Oct');
    expect(bar()?.textContent).toContain('Resume');
  });

  it('shows the start time of a workout started today', () => {
    const start = new Date();
    start.setHours(18, 5, 0, 0);
    load([{ ...listed('w1', 'IN_PROGRESS', '2026-10-09T12:00:00'), startedAt: start.toISOString() }]);
    expect(bar()?.querySelector('.resume-sub')?.textContent?.trim()).toBe('Started 18:05');
  });

  it('shows the day and time of a workout started on an earlier day', () => {
    load([
      { ...listed('w1', 'IN_PROGRESS', '2026-10-09T12:00:00'), startedAt: '2026-10-09T07:30:00' },
    ]);
    expect(bar()?.querySelector('.resume-sub')?.textContent?.trim()).toBe(
      'Started Fri 9 Oct, 07:30',
    );
  });

  it('opens the workout in the logger', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    load([listed('w1', 'IN_PROGRESS', '2026-10-09T12:00:00')]);
    bar()!.click();
    expect(navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'w1' } });
  });

  it('hides once the logger completes the workout', () => {
    load([listed('w1', 'IN_PROGRESS', '2026-10-09T12:00:00')]);
    TestBed.inject(ActiveWorkoutService).completed('w1');
    fixture.detectChanges();
    expect(bar()).toBeNull();
  });

  it('shows a workout whose changes are still waiting on this phone', () => {
    load([]);
    const outbox = TestBed.inject(OutboxService) as unknown as InstantOutbox;
    outbox.online.set(false);
    TestBed.inject(WorkoutCopyService).save(listed('w9', 'IN_PROGRESS', '2026-10-09T12:00:00'));
    void outbox.enqueue({ method: 'POST', path: '/workouts', body: { id: 'w9' }, workoutId: 'w9', label: 'w9' });
    fixture.detectChanges();
    expect(bar()?.textContent).toContain('Workout in progress');
  });

  it('never shows for a coach', () => {
    load([listed('w1', 'IN_PROGRESS', '2026-10-09T12:00:00')]);
    TestBed.inject(AuthService).setSession(fakeToken('COACH'));
    fixture.detectChanges();
    expect(bar()).toBeNull();
  });
});
