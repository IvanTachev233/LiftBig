import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController } from '@ionic/angular';
import { environment } from '../../../../environments/environment';
import { LiftHistory, RepMaxEntry } from '../../../core/lift.service';
import { WeightUnitService } from '../../../core/weight-unit.service';
import {
  ExerciseHistoryModalComponent,
  HistorySet,
} from './exercise-history-modal.component';

describe('ExerciseHistoryModalComponent', () => {
  let fixture: ComponentFixture<ExerciseHistoryModalComponent>;
  let component: ExerciseHistoryModalComponent;
  let http: HttpTestingController;
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

  const set = (id: string, overrides: Partial<HistorySet> = {}): HistorySet => ({
    id,
    reps: 3,
    weight: 100,
    made: true,
    actualReps: null,
    actualWeight: null,
    ...overrides,
  });

  function open(
    entries: RepMaxEntry[],
    sets: HistorySet[] = [],
    { trackable = true, unit = 'kg' as 'kg' | 'lb' } = {},
  ) {
    TestBed.configureTestingModule({
      imports: [ExerciseHistoryModalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
    component.isMaxTrackable = trackable;
    component.sets = sets;
    fixture.detectChanges();
    http.expectOne(historyUrl).flush(history(entries));
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  const recordButtons = () =>
    Array.from<HTMLIonButtonElement>(
      fixture.nativeElement.querySelectorAll('.record-btn'),
    );

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
    open([entry('e1', 1, 100, '2026-09-01')], [], { unit: 'lb' });
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

  it('offers Record only on made logged sets of 1-3 reps', () => {
    open([], [
      set('ok'),
      set('four', { reps: 4 }),
      set('actual-four', { reps: 3, actualReps: 4 }),
      set('missed', { made: false }),
      set('unlogged', { made: null }),
    ]);
    expect(component.recordable.map((s) => s.id)).toEqual(['ok']);
    expect(recordButtons().length).toBe(1);
  });

  it('offers no Record on an exercise that is not max-trackable', () => {
    open([], [set('ok')], { trackable: false });
    expect(recordButtons().length).toBe(0);
  });

  it('records a set and then disables its button', () => {
    open([], [set('ok')]);
    component.record(component.recordable[0]);
    const req = http.expectOne(`${environment.apiUrl}/lifts/rep-maxes/from-set/ok`);
    req.flush({ entry: entry('e9', 3, 100, '2026-10-08', 'ok'), best: null });
    http.expectOne(historyUrl).flush(history([entry('e9', 3, 100, '2026-10-08', 'ok')]));
    fixture.detectChanges();
    expect(recordButtons()[0].disabled).toBeTrue();
  });

  it('disables Record for a set already recorded', () => {
    open([entry('e9', 3, 100, '2026-10-08', 'ok')], [set('ok')]);
    expect(recordButtons()[0].disabled).toBeTrue();
  });

  it('adds a manual entry in kg', () => {
    open([], [], { unit: 'lb' });
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
});
