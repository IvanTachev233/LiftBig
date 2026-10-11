import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { StatsPage } from './stats.page';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';
import { environment } from '../../../environments/environment';
import { Workout, WorkoutStatus } from '../../core/workout.service';
import { WeightUnitService } from '../../core/weight-unit.service';

// Saturday 10 Oct 2026, a minute before midnight on the device
const NOW = new Date(2026, 9, 10, 23, 59);

function workout(
  id: string,
  day: string,
  status: WorkoutStatus = 'COMPLETED',
  totalWeightLifted = 100,
): Workout {
  return {
    id,
    name: `Workout ${id}`,
    date: `${day}T00:00:00.000Z`,
    status,
    totalWeightLifted,
    assignedById: null,
    assignedBy: null,
    exercises: [],
  };
}

describe('StatsPage', () => {
  let component: StatsPage;
  let fixture: ComponentFixture<StatsPage>;
  let httpMock: HttpTestingController;
  let alertControllerSpy: jasmine.SpyObj<AlertController>;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  let alertSpy: jasmine.SpyObj<HTMLIonAlertElement>;
  let toastSpy: jasmine.SpyObj<HTMLIonToastElement>;

  // Polls until the condition holds; slider close() timing varies
  function flushMicrotasks(
    condition: () => boolean,
    timeoutMs = 1000,
  ): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (condition()) {
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('flushMicrotasks: condition not met in time'));
          return;
        }
        setTimeout(check, 10);
      };
      check();
    });
  }

  beforeEach(() => {
    alertSpy = jasmine.createSpyObj('HTMLIonAlertElement', [
      'present',
      'onDidDismiss',
    ]);
    alertSpy.present.and.resolveTo();
    alertSpy.onDidDismiss.and.resolveTo({ role: 'destructive' } as any);

    toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();

    alertControllerSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertControllerSpy.create.and.resolveTo(alertSpy);

    toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);

    TestBed.configureTestingModule({
      imports: [StatsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlertController, useValue: alertControllerSpy },
        { provide: ToastController, useValue: toastControllerSpy },
      ],
    });
    fixture = TestBed.createComponent(StatsPage);
    component = fixture.componentInstance;
    component.now = () => NOW;
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    component.ionViewWillEnter();
    expect(component).toBeTruthy();
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([]);
  });

  it('includes assigned workouts with the coach badge and no delete option', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([
      {
        id: 'assigned-1',
        name: 'Coach Squats',
        date: '2026-09-27',
        status: 'COMPLETED',
        totalWeightLifted: 300,
        assignedById: 'coach-1',
        assignedBy: { id: 'coach-1', name: 'Coach Carter' },
        exercises: [],
      },
      {
        id: 'workout-1',
        name: 'Leg Day',
        date: '2026-09-28',
        status: 'COMPLETED',
        totalWeightLifted: 500,
        assignedById: null,
        assignedBy: null,
        exercises: [],
      },
    ]);
    fixture.detectChanges();

    const items: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-workout-list-item'),
    );
    expect(items.length).toBe(2);
    const item = (name: string) =>
      items.find((i) => i.querySelector('.row-title')?.textContent?.trim() === name)!;
    expect(item('Coach Squats').querySelector('.coach-badge')?.textContent?.trim()).toBe('Coach');
    expect(item('Coach Squats').querySelector('ion-item-option')).toBeNull();
    expect(item('Leg Day').querySelector('.coach-badge')).toBeNull();
    expect(item('Leg Day').querySelector('ion-item-option')).toBeTruthy();
  });

  it('confirming delete on a workout card removes it from the rendered list', async () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([
      {
        id: 'workout-1',
        name: 'Leg Day',
        date: '2026-09-28',
        status: 'COMPLETED',
        totalWeightLifted: 500,
        assignedById: null,
        assignedBy: null,
        exercises: [],
      },
    ]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('app-workout-list-item').length,
    ).toBe(1);

    const listItem = fixture.debugElement.query(
      (de) => de.componentInstance instanceof WorkoutListItemComponent,
    ).componentInstance as WorkoutListItemComponent;

    await listItem.confirmDelete();

    httpMock
      .expectOne(`${environment.apiUrl}/workouts/workout-1`)
      .flush(null);
    await flushMicrotasks(() => component.workouts?.length === 0);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('app-workout-list-item').length,
    ).toBe(0);
  });

  describe('page visits', () => {
    const workoutsUrl = `${environment.apiUrl}/workouts`;
    const completed = (id: string, name: string) => ({
      id,
      name,
      date: '2026-09-28',
      status: 'COMPLETED',
      totalWeightLifted: 500,
      assignedById: null,
      assignedBy: null,
      exercises: [],
    });

    it('makes no request until the page is entered', () => {
      httpMock.expectNone(workoutsUrl);
      component.ionViewWillEnter();
      httpMock.expectOne(workoutsUrl).flush([]);
    });

    it('reloads on every visit and keeps the current list while reloading', () => {
      component.ionViewWillEnter();
      httpMock.expectOne(workoutsUrl).flush([completed('w1', 'Leg Day')]);
      fixture.detectChanges();

      component.ionViewWillEnter();
      const reload = httpMock.expectOne(workoutsUrl);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('app-workout-list-item').length,
      ).toBe(1);

      reload.flush([completed('w1', 'Leg Day'), completed('w2', 'Push Day')]);
      fixture.detectChanges();
      const items: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('app-workout-list-item'),
      );
      expect(items.length).toBe(2);
      expect(items[1].textContent).toContain('Push Day');
    });
  });

  describe('workouts view', () => {
    const url = `${environment.apiUrl}/workouts`;

    function enter(workouts: Workout[]) {
      component.ionViewWillEnter();
      httpMock.expectOne(url).flush(workouts);
      fixture.detectChanges();
    }

    function names(): string[] {
      return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.row-title')).map(
        (t) => t.textContent!.trim(),
      );
    }

    function tiles(): string[][] {
      return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('app-stat-tiles .tile')).map(
        (t) => [
          t.querySelector('.tile-label')!.textContent!.trim(),
          t.querySelector('.tile-value')!.textContent!.trim(),
          t.querySelector('.tile-unit')?.textContent?.trim() ?? '',
        ],
      );
    }

    it('is the History tab root: a title and the Workouts/Lifts control, no back button', () => {
      enter([]);
      expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe('History');
      expect(fixture.nativeElement.querySelector('ion-back-button')).toBeNull();
      const segment = fixture.nativeElement.querySelector('ion-segment');
      expect(segment.value).toBe('workouts');
      expect(
        Array.from<HTMLElement>(segment.querySelectorAll('ion-segment-button')).map((b) => b.textContent!.trim()),
      ).toEqual(['Workouts', 'Lifts']);
    });

    it('leaves out planned workouts still to come and shows past planned ones as Missed', () => {
      enter([
        workout('tomorrow', '2026-10-11', 'PLANNED'),
        workout('started-tomorrow', '2026-10-11', 'IN_PROGRESS'),
        workout('today', '2026-10-10', 'PLANNED'),
        workout('missed', '2026-10-01', 'PLANNED', 0),
      ]);
      expect(names()).toEqual(['Workout started-tomorrow', 'Workout today', 'Workout missed']);
      const subs = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.row-sub')).map(
        (t) => t.textContent!.trim(),
      );
      expect(subs).toEqual(['In progress', 'Today', 'Missed']);
    });

    it('groups by month, newest first, with the year on months of other years', () => {
      enter([
        workout('a', '2026-09-30'),
        workout('b', '2025-03-09'),
        workout('c', '2026-10-05'),
        workout('d', '2026-10-09'),
      ]);
      const headings = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.month-heading')).map(
        (h) => h.textContent!.trim(),
      );
      expect(headings).toEqual(['October', 'September', 'March 2025']);
      expect(names()).toEqual(['Workout d', 'Workout c', 'Workout a', 'Workout b']);
    });

    it("counts only this week's completed and in-progress workouts in the tiles", () => {
      enter([
        workout('mon', '2026-10-05', 'COMPLETED', 1000),
        workout('fri', '2026-10-09', 'IN_PROGRESS', 157),
        workout('missed', '2026-10-07', 'PLANNED', 0),
        workout('last-sunday', '2026-10-04', 'COMPLETED', 500),
      ]);
      expect(tiles()).toEqual([
        ['This week', '2', 'sessions'],
        ['Volume', '1,157', 'kg'],
      ]);
    });

    it('shows volume in pounds for an lb user', () => {
      TestBed.inject(WeightUnitService).setUnit('lb');
      enter([workout('mon', '2026-10-05', 'COMPLETED', 500)]);
      expect(tiles()[1]).toEqual(['Volume', '1,102', 'lb']);
      expect(fixture.nativeElement.querySelector('.row-volume').textContent.replace(/\s+/g, '')).toBe('1,102lb');
    });

    it('says so when there are no workouts yet', () => {
      enter([workout('later', '2026-10-20', 'PLANNED')]);
      expect(fixture.nativeElement.querySelector('.empty-state').textContent.trim()).toBe(
        'No workouts yet. Finished and started sessions show up here.',
      );
    });
  });

  describe('lifts view', () => {
    const api = environment.apiUrl;

    function showLifts(bests: unknown[], exercises: unknown[]) {
      component.ionViewWillEnter();
      httpMock.expectOne(`${api}/workouts`).flush([]);
      component.onViewChange('lifts');
      httpMock.expectOne(`${api}/lifts/best`).flush(bests);
      httpMock.expectOne(`${api}/workouts/exercises`).flush(exercises);
      fixture.detectChanges();
    }

    const best = (exerciseId: string, weightKg: number, achievedOn: string) => ({
      exerciseId,
      weightKg,
      unit: 'kg',
      achievedOn,
      source: 'LOGGED_SET',
    });

    const exercises = [
      { id: 'squat', name: 'Back Squat' },
      { id: 'bench', name: 'Bench Press' },
      { id: 'clean', name: 'Clean' },
    ];

    function rows(): string[][] {
      return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.lift-row')).map((row) =>
        ['.lift-name', '.lift-date', '.lift-weight', '.lift-unit'].map((p) => row.querySelector(p)!.textContent!.trim()),
      );
    }

    it('lists one row per best 1RM, sorted by exercise name, with its date', () => {
      showLifts([best('clean', 90, '2026-09-01'), best('squat', 140, '2026-10-10'), best('bench', 102.5, '2026-08-15')], exercises);
      expect(rows()).toEqual([
        ['Back Squat', 'Oct 10, 2026', '140', 'kg'],
        ['Bench Press', 'Aug 15, 2026', '102.5', 'kg'],
        ['Clean', 'Sep 1, 2026', '90', 'kg'],
      ]);
      expect(fixture.nativeElement.querySelector('app-stat-tiles')).toBeNull();
    });

    it('shows the bests in pounds for an lb user', () => {
      TestBed.inject(WeightUnitService).setUnit('lb');
      showLifts([best('squat', 100, '2026-10-10')], exercises);
      expect(rows()).toEqual([['Back Squat', 'Oct 10, 2026', '220.5', 'lb']]);
    });

    it("opens the exercise's detail on tap", () => {
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      showLifts([best('bench', 100, '2026-10-10')], exercises);
      (fixture.nativeElement.querySelector('.lift-row') as HTMLElement).click();
      expect(navigate).toHaveBeenCalledWith(['/history/lifts', 'bench']);
    });

    it('says how to get a lift listed when there are no bests', () => {
      showLifts([], exercises);
      expect(fixture.nativeElement.querySelector('.lifts-empty').textContent.trim()).toBe(
        'No lifts yet. Log a 1–3 rep set or add an entry.',
      );
    });

    it('opens on the Lifts view when the URL asks for it', () => {
      spyOnProperty(TestBed.inject(Router), 'url').and.returnValue('/history?view=lifts');
      component.ionViewWillEnter();
      httpMock.expectOne(`${api}/workouts`).flush([]);
      httpMock.expectOne(`${api}/lifts/best`).flush([]);
      httpMock.expectOne(`${api}/workouts/exercises`).flush(exercises);
      fixture.detectChanges();
      expect(component.view).toBe('lifts');
      expect(fixture.nativeElement.querySelector('ion-segment').value).toBe('lifts');
    });

    it('reloads the bests on every visit while the Lifts view is open', () => {
      showLifts([best('squat', 100, '2026-10-10')], exercises);
      component.ionViewWillEnter();
      httpMock.expectOne(`${api}/workouts`).flush([]);
      httpMock.expectOne(`${api}/lifts/best`).flush([best('squat', 105, '2026-10-11')]);
      httpMock.expectNone(`${api}/workouts/exercises`);
      fixture.detectChanges();
      expect(rows()[0][2]).toBe('105');
    });
  });
});
