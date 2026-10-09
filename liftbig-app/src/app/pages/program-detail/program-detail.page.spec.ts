import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { ProgramDetail } from '../../core/program.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { ProgramDetailPage } from './program-detail.page';

describe('ProgramDetailPage', () => {
  let fixture: ComponentFixture<ProgramDetailPage>;
  let component: ProgramDetailPage;
  let http: HttpTestingController;
  let alertCtrl: jasmine.SpyObj<AlertController>;
  let navigate: jasmine.Spy;
  const api = environment.apiUrl;

  // Two weeks of a squat day (day 1) and a bench day (day 3)
  function sessions(): ProgramDetail['sessions'] {
    const result: ProgramDetail['sessions'] = [];
    for (const week of [1, 2]) {
      [0, 2].forEach((dayOffset, i) =>
        result.push({
          id: `w${week}s${i + 1}`,
          week,
          sessionIndex: i + 1,
          dayOffset,
          title: i === 0 ? 'Squat Day' : 'Bench Day',
          notes: null,
          exercises: [
            {
              id: `e${week}${i}`,
              exerciseId: 'pause',
              exerciseName: 'Pause Squat',
              order: 1,
              sets: 3,
              reps: 3,
              percentOf1RM: 55,
              referenceExerciseId: 'squat',
              referenceLabel: 'Squat',
              notes: null,
            },
            {
              id: `r${week}${i}`,
              exerciseId: 'row',
              exerciseName: 'Barbell Row',
              order: 2,
              sets: 3,
              reps: 8,
              percentOf1RM: null,
              referenceExerciseId: null,
              referenceLabel: null,
              notes: null,
            },
          ],
        }),
      );
    }
    return result;
  }

  const program: ProgramDetail = {
    id: 'p1',
    name: 'Sample Powerlifting Program',
    description: 'Four weeks',
    authorName: 'LiftBig',
    durationWeeks: 2,
    sessionsPerWeek: 2,
    version: 1,
    sport: { id: 's2', name: 'Powerlifting' },
    referenceLifts: [
      { exerciseId: 'squat', label: 'Squat' },
      { exerciseId: 'bench', label: 'Bench Press' },
    ],
    sessions: sessions(),
  };

  function setup(unit: 'kg' | 'lb' = 'kg', bests: object[] = []) {
    alertCtrl = jasmine.createSpyObj('AlertController', ['create']);
    const toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.resolveTo({ present: () => Promise.resolve() });
    TestBed.configureTestingModule({
      imports: [ProgramDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p1' }) } },
        },
        { provide: AlertController, useValue: alertCtrl },
        { provide: ToastController, useValue: toastCtrl },
      ],
    });
    TestBed.inject(WeightUnitService).setUnit(unit);
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(ProgramDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.ionViewWillEnter();
    http.expectOne(`${api}/programs/p1`).flush(program);
    http
      .expectOne((r) => r.url === `${api}/lifts/best`)
      .flush(bests);
    fixture.detectChanges();
  }

  afterEach(() => {
    http.verify();
    jasmine.clock().uninstall();
  });

  const all = (selector: string) =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(selector)).map(
      (e) => e.textContent!.replace(/\s+/g, ' ').trim(),
    );

  function stubAlert(role: string) {
    const alert = jasmine.createSpyObj('HTMLIonAlertElement', ['present', 'onDidDismiss']);
    alert.present.and.resolveTo();
    alert.onDidDismiss.and.resolveTo({ role });
    alertCtrl.create.and.resolveTo(alert);
  }

  function fillMaxes(squat: number | null, bench: number | null) {
    component.maxes['squat'] = squat;
    component.maxes['bench'] = bench;
    fixture.detectChanges();
  }

  const maxLabels = () =>
    Array.from<HTMLIonInputElement>(
      fixture.nativeElement.querySelectorAll('ion-input.max-input'),
    ).map((input) => input.label);

  const startButton = () =>
    fixture.nativeElement.querySelector('.start-btn') as HTMLIonButtonElement;

  describe('preview', () => {
    beforeEach(() => setup());

    it('shows the program by week and session', () => {
      expect(all('.week-title')).toEqual(['Week 1', 'Week 2']);
      expect(all('.session-title')).toEqual([
        'Day 1 · Squat Day',
        'Day 3 · Bench Day',
        'Day 1 · Squat Day',
        'Day 3 · Bench Day',
      ]);
      expect(all('.session-exercise').slice(0, 2)).toEqual([
        'Pause Squat 3 × 3 @ 55% of Squat',
        'Barbell Row 3 × 8',
      ]);
    });

    it('asks for a max for each reference lift, with the sport labels', () => {
      expect(maxLabels()).toEqual(['Squat', 'Bench Press']);
    });
  });

  describe('starting', () => {
    it('fetches the best lifts of the reference lifts to prefill the maxes', () => {
      setup('kg', [{ exerciseId: 'squat', weightKg: 140 }]);
      expect(component.maxes).toEqual({ squat: 140, bench: null });
    });

    it('prefills the maxes in the user unit', () => {
      setup('lb', [{ exerciseId: 'bench', weightKg: 102.06 }]);
      expect(component.maxes['bench']).toBe(225);
    });

    it('keeps Start disabled while any max is empty', () => {
      setup();
      expect(startButton().disabled).toBeTrue();
      fillMaxes(140, null);
      expect(startButton().disabled).toBeTrue();
      fillMaxes(140, 100);
      expect(startButton().disabled).toBeFalse();
    });

    it('sends maxes typed in pounds as kg', () => {
      setup('lb');
      fillMaxes(315, 225);
      component.start();
      const req = http.expectOne(`${api}/program-enrollments`);
      expect(req.request.body.maxes).toEqual([
        { exerciseId: 'squat', weightKg: 142.88 },
        { exerciseId: 'bench', weightKg: 102.06 },
      ]);
      req.flush({});
    });

    it('defaults the start date to the local day, near midnight too', () => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date(2026, 9, 13, 23, 59, 30));
      setup();
      fillMaxes(140, 100);
      expect(component.minDate).toBe('2026-10-13');
      component.start();
      const req = http.expectOne(`${api}/program-enrollments`);
      expect(req.request.body).toEqual({
        programId: 'p1',
        startDate: '2026-10-13',
        maxes: [
          { exerciseId: 'squat', weightKg: 140 },
          { exerciseId: 'bench', weightKg: 100 },
        ],
      });
      req.flush({});
    });

    it('takes the picked day from the date picker', () => {
      setup();
      fillMaxes(140, 100);
      component.dateChanged({ detail: { value: '2030-01-07T00:00:00' } });
      component.start();
      const req = http.expectOne(`${api}/program-enrollments`);
      expect(req.request.body.startDate).toBe('2030-01-07');
      req.flush({});
    });

    it('shows the schedule after starting', async () => {
      setup();
      fillMaxes(140, 100);
      component.start();
      http.expectOne(`${api}/program-enrollments`).flush({ id: 'en1' });
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith(['/programs/active']);
    });

    it('asks before abandoning an active program and retries with abandonCurrent', async () => {
      setup();
      fillMaxes(140, 100);
      stubAlert('destructive');
      component.start();
      http
        .expectOne(`${api}/program-enrollments`)
        .flush({ message: 'active' }, { status: 409, statusText: 'Conflict' });
      await fixture.whenStable();

      expect(alertCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ header: 'Abandon current program?' }),
      );
      const retry = http.expectOne(`${api}/program-enrollments`);
      expect(retry.request.body.abandonCurrent).toBeTrue();
      retry.flush({ id: 'en2' });
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith(['/programs/active']);
    });

    it('keeps the current program when the abandon confirm is cancelled', async () => {
      setup();
      fillMaxes(140, 100);
      stubAlert('cancel');
      component.start();
      http
        .expectOne(`${api}/program-enrollments`)
        .flush({}, { status: 409, statusText: 'Conflict' });
      await fixture.whenStable();
      http.expectNone(`${api}/program-enrollments`);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
