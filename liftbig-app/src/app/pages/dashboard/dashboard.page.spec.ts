import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { DashboardPage } from './dashboard.page';
import { Workout, WorkoutCard, WorkoutSource, WorkoutStatus } from '../../core/workout.service';
import { BestLift } from '../../core/lift.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';
import { OutboxService } from '../../core/outbox.service';
import { FakeOutboxPlatform, InstantOutbox } from '../../core/outbox.testing';
import { OUTBOX_PLATFORM } from '../../core/outbox.service';
import { ReadCacheService } from '../../core/read-cache.service';
import { WorkoutCopyService } from '../../core/workout-copy.service';

const api = environment.apiUrl;

// Saturday 10 Oct 2026, a minute before midnight on the device
const NOW = new Date(2026, 9, 10, 23, 59);

function card(name: string, sets: number, reps: number, weight: number | null): WorkoutCard {
  return {
    id: `c-${name}`,
    exerciseId: `ex-${name}`,
    exercise: { id: `ex-${name}`, name },
    order: 1,
    supersetGroup: null,
    sets: Array.from({ length: sets }, (_, i) => ({
      id: `s-${name}-${i}`,
      reps,
      weight,
      order: i + 1,
      made: null,
      actualReps: null,
      actualWeight: null,
      notes: null,
    })),
  };
}

function workout(
  id: string,
  day: string,
  status: WorkoutStatus = 'PLANNED',
  source: WorkoutSource = 'manual',
  exercises: WorkoutCard[] = [],
): Workout {
  return {
    id,
    name: `Workout ${id}`,
    date: `${day}T00:00:00.000Z`,
    status,
    totalWeightLifted: 0,
    assignedById: source === 'coach' ? 'coach1' : null,
    assignedBy: source === 'coach' ? { id: 'coach1', name: 'Kim' } : null,
    source,
    program: source === 'program' ? { enrollmentId: 'en1', name: 'Sample' } : null,
    exercises,
  };
}

describe('DashboardPage (Today)', () => {
  let component: DashboardPage;
  let fixture: ComponentFixture<DashboardPage>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(NOW);
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OutboxService, useClass: InstantOutbox },
        { provide: OUTBOX_PLATFORM, useValue: new FakeOutboxPlatform() },
      ],
    });
    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    httpMock.verify();
    jasmine.clock().uninstall();
  });

  interface Answers {
    workouts?: Workout[];
    active?: unknown;
    bests?: BestLift[];
    name?: string | null;
  }

  /** Enters the page and answers its four requests */
  function enter(answers: Answers = {}) {
    component.ionViewWillEnter();
    httpMock.expectOne(`${api}/workouts`).flush(answers.workouts ?? []);
    httpMock.expectOne(`${api}/program-enrollments/active`).flush({ active: answers.active ?? null });
    httpMock.expectOne(`${api}/lifts/best`).flush(answers.bests ?? []);
    httpMock.expectOne(`${api}/users/me`).flush({
      id: 'u1',
      email: 'a@example.test',
      name: answers.name === undefined ? 'Alex Rivera' : answers.name,
      role: 'CLIENT',
      weightUnit: TestBed.inject(WeightUnitService).unit(),
    });
    fixture.detectChanges();
  }

  function el(selector: string): HTMLElement {
    return fixture.nativeElement.querySelector(selector);
  }

  function all(selector: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector));
  }

  function text(selector: string): string {
    return el(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** The texts of the given parts of each matching element */
  function parts(selector: string, partSelectors: string[]): string[][] {
    return all(selector).map((row) =>
      partSelectors
        .map((p) => row.querySelector(p)?.textContent?.trim())
        .filter((t): t is string => !!t),
    );
  }

  const PLAN = ['.plan-name', '.plan-sets', '.plan-weight'];

  const enrollment = {
    id: 'en1',
    status: 'ACTIVE',
    startDate: '2026-10-10',
    program: { id: 'p1', name: 'Sample', sportId: 's1', durationWeeks: 4, sessionsPerWeek: 3 },
    workouts: [workout('prog', '2026-10-10', 'PLANNED', 'program'), workout('prog2', '2026-10-12', 'PLANNED', 'program')],
  };

  describe('page visits', () => {
    it('makes no request until the page is entered', () => {
      httpMock.expectNone(`${api}/workouts`);
      enter();
    });

    it('reloads on every visit and keeps the current screen while reloading', () => {
      enter({ workouts: [workout('w1', '2026-10-10')] });
      expect(text('.today-card .title-card')).toBe('Workout w1');

      component.ionViewWillEnter();
      fixture.detectChanges();
      expect(text('.today-card .title-card')).toBe('Workout w1');
      httpMock.expectOne(`${api}/workouts`).flush([]);
      httpMock.expectOne(`${api}/program-enrollments/active`).flush({ active: null });
      httpMock.expectOne(`${api}/lifts/best`).flush([]);
      httpMock.expectOne(`${api}/users/me`).flush({ name: null, weightUnit: 'kg' });
      fixture.detectChanges();
      expect(el('.today-card.rest-day')).toBeTruthy();
    });
  });

  describe('switching users', () => {
    const signIn = (id: string) => TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id }));
    /** Answers the pending Today requests of one visit; the list for /workouts */
    function answer(reqs: TestRequest[], list: Workout[]) {
      for (const req of reqs) {
        const url = req.request.url;
        if (url === `${api}/workouts`) req.flush(list);
        else if (url.endsWith('/program-enrollments/active')) req.flush({ active: null });
        else if (url.endsWith('/users/me')) req.flush({ name: null, weightUnit: 'kg' });
        else req.flush([]);
      }
      fixture.detectChanges();
    }
    const visitRequests = () =>
      ['/workouts', '/program-enrollments/active', '/lifts/best', '/users/me'].map((p) => httpMock.expectOne(`${api}${p}`));

    afterEach(() => {
      localStorage.removeItem('access_token');
    });

    it("never shows the last user's answers that arrive after another user signed in", () => {
      signIn('userA');
      component.ionViewWillEnter();
      const fromA = visitRequests();
      TestBed.inject(AuthService).logout();
      signIn('userB');
      answer(fromA, [workout('a-plan', '2026-10-10')]);
      expect(text('.today-card .title-card')).not.toBe('Workout a-plan');

      component.ionViewWillEnter();
      answer(visitRequests(), [workout('b-plan', '2026-10-10')]);
      expect(text('.today-card .title-card')).toBe('Workout b-plan');
    });

    it("a new visit replaces the last one's requests, so an older answer can't land after a newer one", () => {
      signIn('userA');
      component.ionViewWillEnter();
      const fromA = visitRequests();
      signIn('userB');
      component.ionViewWillEnter();
      const workoutsReqs = httpMock.match(`${api}/workouts`);
      expect(fromA.every((r) => r.cancelled)).toBeTrue();
      expect(workoutsReqs.length).toBe(1);
      answer(
        [workoutsReqs[0], ...['/program-enrollments/active', '/lifts/best', '/users/me'].map((p) => httpMock.expectOne(`${api}${p}`))],
        [workout('b-plan', '2026-10-10')],
      );
      expect(text('.today-card .title-card')).toBe('Workout b-plan');
    });

    it("keeps the same user's list when a reload fails, never another user's", () => {
      signIn('userA');
      component.ionViewWillEnter();
      answer(visitRequests(), [workout('a-plan', '2026-10-10')]);

      component.ionViewWillEnter();
      const [list, ...rest] = visitRequests();
      list.flush({}, { status: 500, statusText: 'Error' });
      answer(rest, []);
      expect(text('.today-card .title-card')).toBe('Workout a-plan');

      signIn('userB');
      component.ionViewWillEnter();
      const [listB, ...restB] = visitRequests();
      listB.flush({}, { status: 500, statusText: 'Error' });
      answer(restB, []);
      expect(el('.today-card.rest-day')).toBeTruthy();
    });

    it('cancels its requests when the page is destroyed', () => {
      signIn('userA');
      component.ionViewWillEnter();
      const reqs = visitRequests();
      fixture.destroy();
      expect(reqs.every((r) => r.cancelled)).toBeTrue();
    });
  });

  describe('header', () => {
    it('shows the date and greets by first name', () => {
      enter();
      expect(text('.today-date')).toBe('Saturday, 10 October');
      expect(text('app-tab-header ion-title')).toBe('Today');
      expect(text('app-large-title ion-title')).toBe('Evening, Alex');
    });

    it('greets without a name when the profile has none or fails to load', () => {
      enter({ name: null });
      expect(text('app-large-title ion-title')).toBe('Good evening');

      component.ionViewWillEnter();
      httpMock.expectOne(`${api}/workouts`).flush([]);
      httpMock.expectOne(`${api}/program-enrollments/active`).flush({ active: null });
      httpMock.expectOne(`${api}/lifts/best`).flush([]);
      httpMock.expectOne(`${api}/users/me`).flush('down', { status: 500, statusText: 'Error' });
      fixture.detectChanges();
      expect(text('app-large-title ion-title')).toBe('Good evening');
    });
  });

  describe('week strip', () => {
    it('shows Monday to Sunday with completed, open and planned dots and today highlighted', () => {
      enter({
        workouts: [
          workout('a', '2026-10-05', 'COMPLETED'),
          workout('b', '2026-10-07'),
          workout('c', '2026-10-08', 'IN_PROGRESS'),
          workout('d', '2026-10-11'),
        ],
      });
      const days = all('.week-day');
      expect(days.map((d) => d.querySelector('.week-num')!.textContent!.trim())).toEqual([
        '5', '6', '7', '8', '9', '10', '11',
      ]);
      expect(days.map((d) => d.getAttribute('data-dot'))).toEqual([
        'done', null, 'open', 'open', null, null, 'planned',
      ]);
      expect(days.map((d) => d.classList.contains('today'))).toEqual([
        false, false, false, false, false, true, false,
      ]);
      expect(days[5].getAttribute('aria-current')).toBe('date');
    });
  });

  describe('today card', () => {
    it('shows the program session with its week and day, each card as sets × reps and weight, and Start session', () => {
      const prog = workout('prog', '2026-10-10', 'PLANNED', 'program', [
        card('Snatch', 5, 2, 62.5),
        card('Plank', 3, 1, null),
      ]);
      enter({
        workouts: [prog, workout('own', '2026-10-10'), workout('coach', '2026-10-10', 'PLANNED', 'coach')],
        active: enrollment,
      });

      expect(text('.today-card .eyebrow')).toBe('Today · Week 1 · Day 1');
      expect(text('.today-card .title-card')).toBe('Workout prog');
      expect(parts('.today-card .plan-row', PLAN)).toEqual([
        ['Snatch', '5 × 2', '62.5 kg'],
        ['Plank', '3 × 1'],
      ]);

      const start = el('.today-card .start-btn');
      expect(start.textContent!.trim()).toBe('Start session');
      start.click();
      expect(router.navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'prog' } });
    });

    it('shows Resume for a workout in progress', () => {
      enter({ workouts: [workout('w2', '2026-10-10', 'IN_PROGRESS', 'manual', [card('Squat', 3, 5, 100)])] });
      expect(text('.today-card .eyebrow')).toBe('Today');
      expect(text('.today-card .start-btn')).toBe('Resume');
    });

    describe('without a connection', () => {
      /** Enters the page with every request failing as without a connection */
      function enterOffline() {
        component.ionViewWillEnter();
        for (const path of ['/workouts', '/program-enrollments/active', '/lifts/best', '/users/me']) {
          httpMock.expectOne(`${api}${path}`).error(new ProgressEvent('error'), { status: 0, statusText: '' });
        }
        fixture.detectChanges();
      }

      beforeEach(async () => {
        TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u1' }));
        // jasmine's mock clock holds timers; the cache's storage writes use promises only
        await TestBed.inject(ReadCacheService).start();
      });

      afterEach(() => {
        localStorage.removeItem('access_token');
      });

      it('shows the list last loaded on this phone, and Start session opens it', () => {
        enter({ workouts: [workout('prog', '2026-10-10', 'PLANNED', 'program', [card('Snatch', 5, 2, 62.5)])] });
        enterOffline();
        expect(text('.today-card .title-card')).toBe('Workout prog');
        (el('.today-card .start-btn') as HTMLElement).click();
        expect(router.navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'prog' } });
      });

      it('prefers the network while online', () => {
        enter({ workouts: [workout('old', '2026-10-10')] });
        enter({ workouts: [workout('new', '2026-10-10')] });
        expect(text('.today-card .title-card')).toBe('Workout new');
      });

      it("never shows another user's list", () => {
        enter({ workouts: [workout('mine', '2026-10-10')] });
        TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u2' }));
        enterOffline();
        expect(el('.today-card.rest-day')).toBeTruthy();
      });
    });

    describe('with changes waiting on this phone', () => {
      /** The device copy of a workout plus a change that can't be sent yet */
      function queue(w: Workout) {
        TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u1' }));
        const outbox = TestBed.inject(OutboxService) as unknown as InstantOutbox;
        outbox.online.set(false);
        TestBed.inject(WorkoutCopyService).save(w);
        void outbox.enqueue({ method: 'PATCH', path: `/workouts/${w.id}`, body: {}, workoutId: w.id, label: w.name });
      }

      afterEach(() => {
        localStorage.removeItem('access_token');
      });

      it('shows Resume for a planned workout started on this phone', () => {
        queue(workout('coach', '2026-10-10', 'IN_PROGRESS', 'coach', [card('Squat', 3, 5, 100)]));
        enter({ workouts: [workout('coach', '2026-10-10', 'PLANNED', 'coach', [card('Squat', 3, 5, 100)])] });
        expect(text('.today-card .title-card')).toBe('Workout coach');
        expect(text('.today-card .start-btn')).toBe('Resume');
      });

      it('shows a workout the API has not seen yet, also when the list fails to load', () => {
        queue(workout('offline', '2026-10-10', 'IN_PROGRESS'));
        component.ionViewWillEnter();
        httpMock.expectOne(`${api}/workouts`).error(new ProgressEvent('error'));
        httpMock.expectOne(`${api}/program-enrollments/active`).error(new ProgressEvent('error'));
        httpMock.expectOne(`${api}/lifts/best`).error(new ProgressEvent('error'));
        httpMock.expectOne(`${api}/users/me`).error(new ProgressEvent('error'));
        fixture.detectChanges();
        expect(text('.today-card .title-card')).toBe('Workout offline');
        expect(text('.today-card .start-btn')).toBe('Resume');
      });
    });

    it('shows planned weights in pounds for an lb user', () => {
      TestBed.inject(WeightUnitService).setUnit('lb');
      enter({ workouts: [workout('w3', '2026-10-10', 'PLANNED', 'coach', [card('Squat', 5, 5, 100)])] });
      expect(parts('.today-card .plan-row', PLAN)).toEqual([['Squat', '5 × 5', '220.5 lb']]);
    });

    it('without a workout today, shows a rest day whose Empty workout opens a new draft', () => {
      enter({ workouts: [workout('done', '2026-10-10', 'COMPLETED')] });
      expect(el('.today-card.rest-day')).toBeTruthy();
      expect(el('.today-card .start-btn')).toBeNull();

      (el('.empty-workout-btn') as HTMLElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/workout-logger']);
    });
  });

  describe('up next', () => {
    it('lists the next two planned workouts after today and opens one on tap', () => {
      enter({
        workouts: [
          workout('today', '2026-10-10'),
          workout('mon', '2026-10-12'),
          workout('sun', '2026-10-11'),
          workout('later', '2026-10-20'),
        ],
      });
      const rows = all('.up-next app-date-block-row');
      expect(rows.map((r) => r.querySelector('.row-title')!.textContent!.trim())).toEqual([
        'Workout sun',
        'Workout mon',
      ]);

      (el('.up-next .next-row') as HTMLElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'sun' } });
    });

    it('links Full plan to My program only while a program is active', () => {
      enter({ workouts: [workout('mon', '2026-10-12')] });
      expect(el('.full-plan')).toBeNull();
      expect(text('.browse-programs')).toBe('Browse programs');

      enter({ workouts: enrollment.workouts, active: enrollment });
      expect(el('.full-plan').getAttribute('href')).toBe('/programs/active');
      expect(el('.browse-programs')).toBeNull();
    });

    it('says nothing is planned when there is nothing after today', () => {
      enter();
      expect(text('.up-next .empty-next')).toBe('Nothing planned yet.');
      expect(el('.browse-programs').getAttribute('href')).toBe('/programs');
    });
  });

  describe('PR banner', () => {
    const best = (achievedOn: string): BestLift => ({
      exerciseId: 'ex-Bench',
      weightKg: 123,
      unit: 'kg',
      achievedOn,
      source: 'LOGGED_SET',
    });

    it('shows a best from the last 14 days, named from the workouts, linking to its exercise', () => {
      enter({
        workouts: [workout('w', '2026-10-08', 'COMPLETED', 'manual', [card('Bench', 1, 1, 123)])],
        bests: [best('2026-10-08')],
      });
      expect(parts('.pr-banner', ['.pr-text', '.pr-weight'])).toEqual([['New PR · Bench', '123 kg']]);
      (el('.pr-banner') as HTMLElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/history/lifts', 'ex-Bench']);
    });

    it('looks up the name when no loaded workout has the exercise', () => {
      enter({ bests: [best('2026-10-09')] });
      httpMock.expectOne(`${api}/workouts/exercises`).flush([{ id: 'ex-Bench', name: 'Bench Press' }]);
      fixture.detectChanges();
      expect(parts('.pr-banner', ['.pr-text', '.pr-weight'])).toEqual([['New PR · Bench Press', '123 kg']]);
    });

    it('is hidden for an older best', () => {
      enter({ bests: [best('2026-09-25')] });
      expect(el('.pr-banner')).toBeNull();
    });
  });

  describe('selecting days and weeks', () => {
    // Week of Mon 5 to Sun 11 Oct; today is Saturday 10
    const dayButton = (i: number) => all('app-week-strip ol .week-day')[i] as HTMLButtonElement;
    function select(i: number) {
      dayButton(i).click();
      fixture.detectChanges();
    }
    function press(text: string) {
      const button = all('app-week-strip button').find((b) => b.textContent!.trim() === text)!;
      button.click();
      fixture.detectChanges();
    }
    const panelRows = () =>
      parts('.day-panel .day-workout', ['.title-card', '.day-badge', 'app-status-pill', '.day-action']);
    const todayButton = () => el('.back-to-today');
    let toastCtrl: ToastController;

    beforeEach(() => {
      toastCtrl = TestBed.inject(ToastController);
      spyOn(toastCtrl, 'create').and.resolveTo({ present: () => Promise.resolve() } as HTMLIonToastElement);
    });

    it("selects a past day: its completed workout shows View, a missed one Start today, in Today card order", () => {
      enter({
        workouts: [
          workout('own', '2026-10-07', 'COMPLETED', 'manual', [card('Squat', 3, 5, 100)]),
          workout('missed', '2026-10-07', 'PLANNED', 'program', [card('Snatch', 5, 2, 62.5)]),
          workout('coach', '2026-10-07', 'IN_PROGRESS', 'coach'),
          workout('today', '2026-10-10'),
        ],
      });
      select(2);

      expect(dayButton(2).classList).toContain('selected');
      expect(text('.day-panel .eyebrow')).toBe('Wed 7 Oct');
      expect(el('.today-card')).toBeNull();
      expect(el('.empty-workout-btn')).toBeNull();
      expect(panelRows()).toEqual([
        ['Workout coach', 'Coach · Kim', 'In progress', 'Resume'],
        ['Workout missed', 'Program · Sample', 'Missed', 'Start today'],
        ['Workout own', 'Done', 'View'],
      ]);
      expect(parts('.day-panel .day-workout:nth-child(3) .plan-row', PLAN)).toEqual([['Squat', '3 × 5', '100 kg']]);
      // The large title keeps today's date
      expect(text('.today-date')).toBe('Saturday, 10 October');

      (el('.day-panel .day-workout:nth-child(3) .day-action') as HTMLElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'own' } });
      (el('.day-panel .day-workout:nth-child(1) .day-action') as HTMLElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'coach' } });
    });

    it('Start today moves the workout to the local today, then opens it in the logger', () => {
      const missed = workout('missed', '2026-10-07', 'PLANNED', 'program');
      enter({ workouts: [missed] });
      select(2);
      (el('.day-panel .day-action') as HTMLElement).click();

      const req = httpMock.expectOne(`${api}/workouts/missed`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ date: '2026-10-10' });
      expect(router.navigate).not.toHaveBeenCalled();
      req.flush({ ...missed, date: '2026-10-10T00:00:00.000Z' });
      fixture.detectChanges();

      expect(router.navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'missed' } });
      // Its dot moves to today
      expect(dayButton(2).getAttribute('data-dot')).toBeNull();
      expect(dayButton(5).getAttribute('data-dot')).toBe('planned');
    });

    it('a failed Start today shows an error toast, stays put and leaves the workout on its day', async () => {
      enter({ workouts: [workout('missed', '2026-10-07')] });
      select(2);
      (el('.day-panel .day-action') as HTMLElement).click();
      httpMock.expectOne(`${api}/workouts/missed`).flush('offline', { status: 0, statusText: 'Unknown Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(toastCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ color: 'danger', message: "Couldn't move the session to today" }),
      );
      expect(router.navigate).not.toHaveBeenCalled();
      expect(dayButton(2).getAttribute('data-dot')).toBe('open');
      expect(panelRows()[0]).toContain('Start today');
    });

    it('Start today belongs to its visit: leaving drops the request, so it never opens the logger later', () => {
      enter({ workouts: [workout('missed', '2026-10-07')] });
      select(2);
      (el('.day-panel .day-action') as HTMLElement).click();
      const req = httpMock.expectOne(`${api}/workouts/missed`);

      enter({ workouts: [workout('missed', '2026-10-07')] });
      expect(req.cancelled).toBeTrue();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(dayButton(2).getAttribute('data-dot')).toBe('open');
    });

    it('keeps the moved workout for reads without a connection', () => {
      TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u1' }));
      const adopt = spyOn(TestBed.inject(ReadCacheService), 'adopt');
      const missed = workout('missed', '2026-10-07');
      enter({ workouts: [missed] });
      select(2);
      (el('.day-panel .day-action') as HTMLElement).click();
      const moved = { ...missed, date: '2026-10-10T00:00:00.000Z' };
      httpMock.expectOne(`${api}/workouts/missed`).flush(moved);

      expect(adopt).toHaveBeenCalledWith('u1', jasmine.objectContaining({ id: 'missed', date: moved.date }));
      localStorage.removeItem('access_token');
    });

    it('a future day shows Start today for a planned workout, and Nothing planned when empty', () => {
      enter({ workouts: [workout('later', '2026-10-11', 'PLANNED', 'coach')] });
      select(6);
      expect(text('.day-panel .eyebrow')).toBe('Sun 11 Oct');
      expect(panelRows()).toEqual([['Workout later', 'Coach · Kim', 'Planned', 'Start today']]);

      press('Next week');
      select(6);
      expect(text('.day-panel .eyebrow')).toBe('Sun 18 Oct');
      expect(text('.day-panel .day-empty')).toBe('Nothing planned');
    });

    it('an empty past day says Rest day without Empty workout', () => {
      enter();
      select(0);
      expect(text('.day-panel .day-empty')).toBe('Rest day');
      expect(el('.empty-workout-btn')).toBeNull();
    });

    // Spec § LB-35 (Ivan, 2026-11-06): changing the week never changes the selected day
    describe('changing the week keeps the selected day', () => {
      const nums = () => all('app-week-strip ol .week-day').map((d) => d.querySelector('.week-num')!.textContent!.trim());
      const selectedDays = () => all('app-week-strip ol .week-day.selected');

      it("shows that week's days and dots with none selected, and the panel stays on today", () => {
        enter({
          workouts: [workout('old', '2026-09-30', 'COMPLETED'), workout('today', '2026-10-10'), workout('soon', '2026-10-14')],
        });
        press('Next week');

        expect(nums()).toEqual(['12', '13', '14', '15', '16', '17', '18']);
        expect(dayButton(2).getAttribute('data-dot')).toBe('planned');
        expect(selectedDays().length).toBe(0);
        expect(el('.day-panel')).toBeNull();
        expect(text('.today-card .title-card')).toBe('Workout today');

        press('Previous week');
        press('Previous week');
        expect(nums()).toEqual(['28', '29', '30', '1', '2', '3', '4']);
        expect(dayButton(2).getAttribute('data-dot')).toBe('done');
        expect(all('app-week-strip ol .today').length).toBe(0);
        expect(selectedDays().length).toBe(0);
        expect(text('.today-card .title-card')).toBe('Workout today');
      });

      it('paging back and forth lands on the current week with today still selected', () => {
        enter();
        press('Previous week');
        press('Previous week');
        press('Next week');
        press('Next week');

        expect(nums()).toEqual(['5', '6', '7', '8', '9', '10', '11']);
        expect(dayButton(5).classList).toContain('today');
        expect(dayButton(5).classList).toContain('selected');
        expect(selectedDays().length).toBe(1);
        expect(todayButton()).toBeNull();
        expect(el('.today-card')).toBeTruthy();
      });

      it('keeps another selected day in the panel while a later week shows', () => {
        enter({ workouts: [workout('own', '2026-10-07', 'COMPLETED')] });
        select(2);
        press('Next week');

        expect(text('.day-panel .eyebrow')).toBe('Wed 7 Oct');
        expect(panelRows()).toEqual([['Workout own', 'Done', 'View']]);
        expect(selectedDays().length).toBe(0);

        press('Previous week');
        expect(dayButton(2).classList).toContain('selected');
        expect(text('.day-panel .eyebrow')).toBe('Wed 7 Oct');
      });
    });

    it('gives the strip the weeks either side of the shown one, with their dots', () => {
      enter({ workouts: [workout('old', '2026-09-30', 'COMPLETED'), workout('soon', '2026-10-14')] });
      const peekDays = (side: 'prev' | 'next') => all(`app-week-strip .week-peek.${side} .peek-day`);
      const peekNums = (side: 'prev' | 'next') => peekDays(side).map((d) => d.querySelector('.week-num')!.textContent!.trim());

      expect(peekNums('prev')).toEqual(['28', '29', '30', '1', '2', '3', '4']);
      expect(peekDays('prev')[2].getAttribute('data-dot')).toBe('done');
      expect(peekNums('next')).toEqual(['12', '13', '14', '15', '16', '17', '18']);
      expect(peekDays('next')[2].getAttribute('data-dot')).toBe('planned');

      press('Next week');
      expect(peekNums('prev')).toEqual(['5', '6', '7', '8', '9', '10', '11']);
      expect(peekDays('prev')[5].classList).toContain('today');
      expect(peekNums('next')).toEqual(['19', '20', '21', '22', '23', '24', '25']);
    });

    it('shows the Today button only away from today, and it goes back to today', () => {
      enter({ workouts: [workout('today', '2026-10-10')] });
      expect(todayButton()).toBeNull();

      select(1);
      expect(todayButton()).toBeTruthy();
      select(5);
      expect(todayButton()).toBeNull();

      press('Next week');
      expect(all('app-week-strip ol .week-day.selected').length).toBe(0);
      expect(text('.today-card .title-card')).toBe('Workout today');
      expect(todayButton()).toBeTruthy();
      todayButton().click();
      fixture.detectChanges();

      expect(todayButton()).toBeNull();
      expect(dayButton(5).classList).toContain('today');
      expect(dayButton(5).classList).toContain('selected');
      expect(text('.today-card .title-card')).toBe('Workout today');
      expect(el('.day-panel')).toBeNull();
    });

    it('opens on the current week with today selected on each visit', () => {
      enter();
      press('Previous week');
      select(3);
      enter();
      expect(dayButton(5).classList).toContain('today');
      expect(dayButton(5).classList).toContain('selected');
      expect(todayButton()).toBeNull();
      expect(el('.today-card')).toBeTruthy();
    });

    it("lists today's other open workouts as rows under the Today card that open them", () => {
      enter({
        workouts: [
          workout('prog', '2026-10-10', 'PLANNED', 'program'),
          workout('own', '2026-10-10'),
          workout('coach', '2026-10-10', 'PLANNED', 'coach'),
          workout('done', '2026-10-10', 'COMPLETED'),
        ],
      });
      expect(text('.today-card .title-card')).toBe('Workout prog');
      expect(parts('.today-others .other-row', ['.row-title', '.row-sub'])).toEqual([
        ['Workout coach', 'Coach · Kim'],
        ['Workout own'],
      ]);
      (all('.today-others .other-row')[1] as HTMLElement).click();
      expect(router.navigate).toHaveBeenCalledWith(['/workout-logger'], { queryParams: { id: 'own' } });
    });

    it('shows no other rows when today has one open workout', () => {
      enter({ workouts: [workout('own', '2026-10-10')] });
      expect(el('.today-others')).toBeNull();
    });
  });

  it('has no floating button, side menu or Join a Coach card', () => {
    enter();
    expect(el('ion-fab')).toBeNull();
    expect(el('ion-menu-button')).toBeNull();
    expect(el('.invite-card')).toBeNull();
  });
});
