import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { environment } from '../../../../environments/environment';
import { LiftHistory, RepMaxEntry } from '../../../core/lift.service';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { ExerciseHistoryModalComponent } from './exercise-history-modal.component';

describe('ExerciseHistoryModalComponent', () => {
  let fixture: ComponentFixture<ExerciseHistoryModalComponent>;
  let component: ExerciseHistoryModalComponent;
  let http: HttpTestingController;
  let alertSpy: jasmine.SpyObj<HTMLIonAlertElement>;
  let alertCtrlSpy: jasmine.SpyObj<AlertController>;
  let toastCtrlSpy: jasmine.SpyObj<ToastController>;
  const historyUrl = `${environment.apiUrl}/lifts/squat/history`;

  const entry = (
    id: string,
    reps: number,
    weightKg: number,
    achievedOn: string,
    workoutSetId: string | null = null,
  ): RepMaxEntry => ({
    id,
    exerciseId: 'squat',
    reps,
    weightKg,
    unit: 'kg',
    achievedOn,
    source: workoutSetId ? 'LOGGED_SET' : 'MANUAL',
    workoutSetId,
    createdAt: `${achievedOn}T10:00:00Z`,
  });

  const history = (entries: RepMaxEntry[]): LiftHistory => ({
    exerciseId: 'squat',
    best: null,
    latest: [1, 2, 3].map((reps) => ({
      reps,
      entry: [...entries].reverse().find((e) => e.reps === reps) ?? null,
    })),
    entries,
  });

  function open(entries: RepMaxEntry[], { unit = 'kg' as 'kg' | 'lb' } = {}) {
    alertSpy = jasmine.createSpyObj('HTMLIonAlertElement', ['present', 'onDidDismiss']);
    alertSpy.present.and.resolveTo();
    alertCtrlSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertCtrlSpy.create.and.resolveTo(alertSpy);
    const toast = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toast.present.and.resolveTo();
    toastCtrlSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrlSpy.create.and.resolveTo(toast);
    TestBed.configureTestingModule({
      imports: [ExerciseHistoryModalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertController, useValue: alertCtrlSpy },
        { provide: ToastController, useValue: toastCtrlSpy },
      ],
    });
    TestBed.overrideComponent(ExerciseHistoryModalComponent, {
      add: {
        providers: [
          { provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['dismiss']) },
        ],
      },
    });
    TestBed.inject(WeightUnitService).setUnit(unit);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ExerciseHistoryModalComponent);
    component = fixture.componentInstance;
    component.exerciseId = 'squat';
    component.exerciseName = 'Back Squat';
    fixture.detectChanges();
    http.expectOne(historyUrl).flush(history(entries));
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  /** Text of each listed entry, in shown order */
  const entryRows = () =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.entry-row')).map((row) =>
      ['.entry-weight', '.entry-meta']
        .map((part) => row.querySelector(part)!.textContent!.trim())
        .join(' '),
    );

  /** Waits for the confirm alert and the request after it */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('plots one e1RM point per entry, oldest first, 1RM as is and 3 x 100 kg as 110', () => {
    open([
      entry('e2', 3, 100, '2026-10-05'),
      entry('e1', 1, 100, '2026-09-01'),
    ]);
    expect(component.chartData.datasets[0].data).toEqual([
      { x: Date.UTC(2026, 8, 1), y: 100 },
      { x: Date.UTC(2026, 9, 5), y: 110 },
    ]);
  });

  it('shows the chart and latest maxes in pounds for lb users', () => {
    open([entry('e1', 1, 100, '2026-09-01')], { unit: 'lb' });
    expect(component.chartData.datasets[0].data).toEqual([
      { x: Date.UTC(2026, 8, 1), y: 220.5 },
    ]);
    const latest = (fixture.nativeElement as HTMLElement).querySelector('.latest-1')!;
    expect(latest.textContent).toContain('220.5 lb');
  });

  it('lists the latest 1RM, 2RM and 3RM with dates', () => {
    open([entry('e1', 1, 100, '2026-09-01'), entry('e3', 3, 90, '2026-09-10')]);
    const text = (n: number) =>
      (fixture.nativeElement.querySelector(`.latest-${n}`) as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(text(1)).toContain('100 kg');
    expect(text(1)).toContain('Sep 1, 2026');
    expect(text(2)).toContain('—');
    expect(text(3)).toContain('90 kg');
  });

  it('shows an empty state without entries', () => {
    open([]);
    expect(fixture.nativeElement.querySelector('.history-empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });

  it('adds a manual entry in kg', () => {
    open([], { unit: 'lb' });
    component.newEntry = { reps: 2, weight: 225, achievedOn: '2026-10-01' };
    component.addEntry();
    const req = http.expectOne(`${environment.apiUrl}/lifts/rep-maxes`);
    expect(req.request.body).toEqual({
      exerciseId: 'squat',
      reps: 2,
      weightKg: 102.06,
      achievedOn: '2026-10-01',
    });
    req.flush({ entry: entry('e1', 2, 102.06, '2026-10-01'), best: null });
    http.expectOne(historyUrl).flush(history([entry('e1', 2, 102.06, '2026-10-01')]));
  });

  it('renders no "Record as rep max" button', () => {
    open([entry('e9', 1, 120, '2026-10-08', 'set-1')]);
    expect(fixture.nativeElement.querySelector('.record-btn')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Record as rep max');
  });

  describe('entries', () => {
    const entries = () => [
      entry('e1', 1, 100, '2026-09-01'),
      entry('e2', 3, 100, '2026-10-05', 'set-2'),
      { ...entry('e3', 2, 90, '2026-09-20'), source: 'PROGRAM_SETUP' as const },
    ];

    const removeFirst = () =>
      (fixture.nativeElement.querySelector('.entry-row .remove-entry-btn') as HTMLElement).click();

    it("lists entries newest first with reps, weight in the user's unit, date and source", () => {
      open(entries(), { unit: 'lb' });
      expect(entryRows()).toEqual([
        '3 × 220.5 lb Oct 5, 2026 · Logged set',
        '2 × 198.4 lb Sep 20, 2026 · Program setup',
        '1 × 220.5 lb Sep 1, 2026 · Manual',
      ]);
    });

    it('orders entries on the same date by when they were recorded, newest first', () => {
      open([
        { ...entry('a', 1, 100, '2026-10-05'), createdAt: '2026-10-05T08:00:00Z' },
        { ...entry('b', 1, 105, '2026-10-05'), createdAt: '2026-10-05T09:00:00Z' },
      ]);
      expect(entryRows().map((t) => t.split(' Oct')[0])).toEqual(['1 × 105 kg', '1 × 100 kg']);
    });

    it('shows a YYYY-MM-DD date as that calendar day in the list and latest tile, in any time zone', () => {
      open([entry('ny', 1, 100, '2026-01-01')]);
      expect(entryRows()[0]).toContain('Jan 1, 2026');
      expect((fixture.nativeElement.querySelector('.latest-1') as HTMLElement).textContent).toContain(
        'Jan 1, 2026',
      );
    });

    it('the remove button names the entry', () => {
      open(entries(), { unit: 'lb' });
      const button = fixture.nativeElement.querySelector('.entry-row .remove-entry-btn') as HTMLElement;
      expect(button.getAttribute('aria-label')).toBe('Remove 3 × 220.5 lb, Oct 5, 2026');
    });

    it('asks to confirm and sends nothing when cancelled', async () => {
      open(entries());
      alertSpy.onDidDismiss.and.resolveTo({ role: 'cancel' } as any);
      removeFirst();
      await settle();

      expect(alertCtrlSpy.create).toHaveBeenCalled();
      http.expectNone((r) => r.method === 'DELETE');
      expect(entryRows().length).toBe(3);
    });

    it('confirmed: sends the DELETE, then reloads the chart, latest tiles and list', async () => {
      open(entries());
      expect(component.chartData.datasets[0].data.length).toBe(3);
      alertSpy.onDidDismiss.and.resolveTo({ role: 'destructive' } as any);

      // The newest entry (e2) is listed first
      removeFirst();
      await settle();

      const req = http.expectOne(`${environment.apiUrl}/lifts/rep-maxes/e2`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
      http.expectOne(historyUrl).flush(history(entries().filter((e) => e.id !== 'e2')));
      fixture.detectChanges();

      expect(component.chartData.datasets[0].data.length).toBe(2);
      expect(entryRows().length).toBe(2);
      expect((fixture.nativeElement.querySelector('.latest-3') as HTMLElement).textContent).toContain('—');
    });

    it('a failed DELETE shows a toast and keeps the entry', async () => {
      open(entries());
      alertSpy.onDidDismiss.and.resolveTo({ role: 'destructive' } as any);
      removeFirst();
      await settle();

      http
        .expectOne(`${environment.apiUrl}/lifts/rep-maxes/e2`)
        .flush('failed', { status: 500, statusText: 'Server Error' });
      await settle();
      fixture.detectChanges();

      expect(toastCtrlSpy.create).toHaveBeenCalled();
      http.expectNone(historyUrl);
      expect(entryRows().length).toBe(3);
      expect(component.chartData.datasets[0].data.length).toBe(3);
    });
  });
});
