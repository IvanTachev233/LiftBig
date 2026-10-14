import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { Workout, WorkoutCard, WorkoutSource, WorkoutStatus } from '../../core/workout.service';
import { BestLift } from '../../core/lift.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { environment } from '../../../environments/environment';

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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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

  it('has no floating button, side menu or Join a Coach card', () => {
    enter();
    expect(el('ion-fab')).toBeNull();
    expect(el('ion-menu-button')).toBeNull();
    expect(el('.invite-card')).toBeNull();
  });
});
