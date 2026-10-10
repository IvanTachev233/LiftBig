import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { Enrollment } from '../../core/program.service';
import { Workout, WorkoutStatus } from '../../core/workout.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { ActiveProgramPage } from './active-program.page';

describe('ActiveProgramPage', () => {
  let fixture: ComponentFixture<ActiveProgramPage>;
  let component: ActiveProgramPage;
  let http: HttpTestingController;
  let alertCtrl: jasmine.SpyObj<AlertController>;
  const api = environment.apiUrl;

  const workout = (
    id: string,
    date: string,
    status: WorkoutStatus,
    squatKg = 97.5,
  ): Workout => ({
    id,
    name: `Sample: ${id}`,
    date: `${date}T00:00:00.000Z`,
    status,
    totalWeightLifted: 0,
    assignedById: null,
    assignedBy: null,
    source: 'program',
    program: { enrollmentId: 'en1', name: 'Sample' },
    exercises: [
      {
        id: `${id}-c1`,
        exerciseId: 'squat',
        order: 1,
        supersetGroup: null,
        sets: [
          {
            id: `${id}-s1`,
            reps: 5,
            weight: squatKg,
            order: 1,
            made: null,
            actualReps: null,
            actualWeight: null,
            notes: null,
            prescribedPercent: 70,
            referenceExerciseId: 'squat',
          },
        ],
      },
    ],
  });

  const enrollment = (workouts: Workout[]): Enrollment => ({
    id: 'en1',
    status: 'ACTIVE',
    startDate: '2026-10-14',
    programId: 'p1',
    programVersion: 1,
    maxesSnapshot: { squat: 140 },
    createdAt: '2026-10-08T10:00:00.000Z',
    program: {
      id: 'p1',
      name: 'Sample Powerlifting Program',
      sportId: 's2',
      durationWeeks: 2,
      sessionsPerWeek: 2,
    },
    workouts,
  });

  const active = enrollment([
    workout('w1', '2026-10-14', 'COMPLETED'),
    workout('w2', '2026-10-16', 'IN_PROGRESS'),
    workout('w3', '2026-10-21', 'PLANNED'),
    workout('w4', '2026-10-23', 'PLANNED'),
  ]);

  const sports = [
    {
      id: 's2',
      name: 'Powerlifting',
      displayOrder: 2,
      requiredLifts: [
        { exerciseId: 'squat', exerciseName: 'Back Squat', label: 'Squat', displayOrder: 1 },
      ],
    },
  ];

  function setup(response: Enrollment | null = active) {
    alertCtrl = jasmine.createSpyObj('AlertController', ['create']);
    const toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.resolveTo({ present: () => Promise.resolve() });
    TestBed.configureTestingModule({
      imports: [ActiveProgramPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlertController, useValue: alertCtrl },
        { provide: ToastController, useValue: toastCtrl },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ActiveProgramPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.ionViewWillEnter();
    http.expectOne(`${api}/program-enrollments/active`).flush({ active: response });
    if (response) http.expectOne(`${api}/sports`).flush(sports);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  const page = {
    all: (selector: string) =>
      Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(selector)).map(
        (e) => e.textContent!.replace(/\s+/g, ' ').trim(),
      ),
    text: (selector: string) => page.all(selector)[0],
    count: (selector: string) =>
      fixture.nativeElement.querySelectorAll(selector).length as number,
  };

  const maxLabels = () =>
    Array.from<HTMLIonInputElement>(
      fixture.nativeElement.querySelectorAll('ion-input.max-input'),
    ).map((input) => input.label);

  function stubAlert(role: string) {
    const alert = jasmine.createSpyObj('HTMLIonAlertElement', ['present', 'onDidDismiss']);
    alert.present.and.resolveTo();
    alert.onDidDismiss.and.resolveTo({ role });
    alertCtrl.create.and.resolveTo(alert);
  }

  it('shows the program name, start date and sessions by week', () => {
    setup();
    expect(page.text('.program-title')).toBe('Sample Powerlifting Program');
    expect(page.text('.program-start')).toContain('Oct 14, 2026');
    expect(page.all('.week-title')).toEqual(['Week 1', 'Week 2']);
    expect(page.all('.session-date')).toEqual([
      'Oct 14, 2026',
      'Oct 16, 2026',
      'Oct 21, 2026',
      'Oct 23, 2026',
    ]);
  });

  it('shows COMPLETED sessions as done and the others by status', () => {
    setup();
    expect(page.all('.session-status')).toEqual([
      'Done',
      'In progress',
      'Planned',
      'Planned',
    ]);
    expect(page.count('.session-done')).toBe(1);
  });

  it('prefills Recalculate with the current bests and refreshes the targets', () => {
    setup();
    component.openRecalculate();
    http
      .expectOne((r) => r.url === `${api}/lifts/best`)
      .flush([{ exerciseId: 'squat', weightKg: 150 }]);
    fixture.detectChanges();
    expect(maxLabels()).toEqual(['Squat']);
    expect(component.maxes).toEqual({ squat: 150 });

    component.maxes['squat'] = 160;
    component.recalculate();
    const req = http.expectOne(`${api}/program-enrollments/en1/recalculate`);
    expect(req.request.body).toEqual({ maxes: [{ exerciseId: 'squat', weightKg: 160 }] });
    req.flush(
      enrollment([
        workout('w1', '2026-10-14', 'COMPLETED'),
        workout('w2', '2026-10-16', 'IN_PROGRESS'),
        workout('w3', '2026-10-21', 'PLANNED', 112.5),
        workout('w4', '2026-10-23', 'PLANNED', 112.5),
      ]),
    );
    fixture.detectChanges();
    expect(component.active!.workouts[2].exercises[0].sets[0].weight).toBe(112.5);
    expect(component.recalculating).toBeFalse();
  });

  it("lists the Recalculate lifts in the sport's order, whatever the snapshot order", () => {
    const twoLifts = {
      ...active,
      maxesSnapshot: { bench: 100, squat: 140 },
    };
    alertCtrl = jasmine.createSpyObj('AlertController', ['create']);
    TestBed.configureTestingModule({
      imports: [ActiveProgramPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlertController, useValue: alertCtrl },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ActiveProgramPage);
    component = fixture.componentInstance;
    component.ionViewWillEnter();
    http.expectOne(`${api}/program-enrollments/active`).flush({ active: twoLifts });
    http.expectOne(`${api}/sports`).flush([
      {
        ...sports[0],
        requiredLifts: [
          { exerciseId: 'bench', exerciseName: 'Bench Press', label: 'Bench Press', displayOrder: 2 },
          { exerciseId: 'squat', exerciseName: 'Back Squat', label: 'Squat', displayOrder: 1 },
        ],
      },
    ]);
    component.openRecalculate();
    http.expectOne((r) => r.url === `${api}/lifts/best`).flush([]);
    fixture.detectChanges();
    expect(maxLabels()).toEqual(['Squat', 'Bench Press']);
  });

  it('sends recalculated maxes typed in pounds as kg', () => {
    setup();
    TestBed.inject(WeightUnitService).setUnit('lb');
    component.openRecalculate();
    http.expectOne((r) => r.url === `${api}/lifts/best`).flush([]);
    expect(component.maxes).toEqual({ squat: 308.6 });
    component.maxes['squat'] = 225;
    component.recalculate();
    const req = http.expectOne(`${api}/program-enrollments/en1/recalculate`);
    expect(req.request.body).toEqual({ maxes: [{ exerciseId: 'squat', weightKg: 102.06 }] });
    req.flush(active);
  });

  it('abandons after confirming and then shows no active program', async () => {
    setup();
    stubAlert('destructive');
    await component.abandon();
    const req = http.expectOne(`${api}/program-enrollments/en1/abandon`);
    req.flush({ ...active, status: 'ABANDONED', workouts: [] });
    fixture.detectChanges();
    expect(component.active).toBeNull();
    expect(page.count('.no-program')).toBe(1);
  });

  it('keeps the program when the abandon confirm is cancelled', async () => {
    setup();
    stubAlert('cancel');
    await component.abandon();
    http.expectNone(`${api}/program-enrollments/en1/abandon`);
    expect(component.active).not.toBeNull();
  });

  it('shows an empty state without an active program', () => {
    setup(null);
    expect(page.count('.no-program')).toBe(1);
  });
});
