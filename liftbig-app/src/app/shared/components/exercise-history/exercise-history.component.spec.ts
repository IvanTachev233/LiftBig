import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ToastController } from '@ionic/angular';
import { ConfirmSheetService } from '../../ui/confirm-sheet.component';
import { SoftDelete, UndoToastService } from '../../ui/undo-toast.service';
import { environment } from '../../../../environments/environment';
import { LiftHistory, RepMaxEntry } from '../../../core/lift.service';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { BottomSheetService } from '../../ui/bottom-sheet.service';
import { ExerciseHistoryComponent } from './exercise-history.component';

// Saturday 10 Oct 2026
const NOW = new Date(2026, 9, 10, 12, 0);

describe('ExerciseHistoryComponent', () => {
  let fixture: ComponentFixture<ExerciseHistoryComponent>;
  let component: ExerciseHistoryComponent;
  let sheetSpy: jasmine.SpyObj<BottomSheetService>;
  let http: HttpTestingController;
  let confirmSpy: jasmine.SpyObj<ConfirmSheetService>;
  let undoSpy: jasmine.SpyObj<UndoToastService>;
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

  const history = (entries: RepMaxEntry[], best: LiftHistory['best'] = null): LiftHistory => ({
    exerciseId: 'squat',
    best,
    latest: [1, 2, 3].map((reps) => ({
      reps,
      entry: [...entries].reverse().find((e) => e.reps === reps) ?? null,
    })),
    entries,
  });

  function open(
    entries: RepMaxEntry[],
    { unit = 'kg' as 'kg' | 'lb', best = null as LiftHistory['best'] } = {},
  ) {
    confirmSpy = jasmine.createSpyObj('ConfirmSheetService', ['confirm']);
    confirmSpy.confirm.and.resolveTo(true);
    undoSpy = jasmine.createSpyObj('UndoToastService', ['softDelete']);
    undoSpy.softDelete.and.resolveTo('undone');
    const toast = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toast.present.and.resolveTo();
    toastCtrlSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrlSpy.create.and.resolveTo(toast);
    sheetSpy = jasmine.createSpyObj('BottomSheetService', ['open']);
    TestBed.configureTestingModule({
      imports: [ExerciseHistoryComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfirmSheetService, useValue: confirmSpy },
        { provide: UndoToastService, useValue: undoSpy },
        { provide: ToastController, useValue: toastCtrlSpy },
        { provide: BottomSheetService, useValue: sheetSpy },
      ],
    });
    TestBed.inject(WeightUnitService).setUnit(unit);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ExerciseHistoryComponent);
    component = fixture.componentInstance;
    component.exerciseId = 'squat';
    component.now = () => NOW;
    fixture.detectChanges();
    http.expectOne(historyUrl).flush(history(entries, best));
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  /** Text of each listed entry, in shown order */
  const entryRows = () =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.entry-row')).map((row) =>
      ['.entry-kg', '.entry-unit', '.entry-date', '.entry-source']
        .map((part) => row.querySelector(part)!.textContent!.trim())
        .join(' '),
    );

  /** Waits for the confirm sheet and what follows it */
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
      (fixture.nativeElement.querySelector('ion-item-option.swipe-delete') as HTMLElement).click();

    it("lists entries newest first with reps, weight in the user's unit, date and source", () => {
      open(entries(), { unit: 'lb' });
      expect(entryRows()).toEqual([
        '220.5 lb × 3 Oct 5, 2026 Logged',
        '198.4 lb × 2 Sep 20, 2026 Program setup',
        '220.5 lb × 1 Sep 1, 2026 Manual',
      ]);
    });

    it('orders entries on the same date by when they were recorded, newest first', () => {
      open([
        { ...entry('a', 1, 100, '2026-10-05'), createdAt: '2026-10-05T08:00:00Z' },
        { ...entry('b', 1, 105, '2026-10-05'), createdAt: '2026-10-05T09:00:00Z' },
      ]);
      expect(entryRows().map((t) => t.split(' Oct')[0])).toEqual(['105 kg × 1', '100 kg × 1']);
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
      const button = fixture.nativeElement.querySelector('ion-item-option.swipe-delete') as HTMLElement;
      expect(button.getAttribute('aria-label')).toBe('Remove 3 × 220.5 lb, Oct 5, 2026');
    });

    const job = () => undoSpy.softDelete.calls.mostRecent().args[0] as SoftDelete;

    it('an entry from a logged set asks first, showing its row; cancelling removes nothing', async () => {
      open(entries());
      confirmSpy.confirm.and.resolveTo(false);
      removeFirst();
      await settle();

      expect(confirmSpy.confirm).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          title: 'Remove this entry?',
          message: 'It will no longer count toward your personal bests.',
          confirmLabel: 'Remove entry',
          summary: component.entryLine,
          summaryContext: jasmine.objectContaining({ id: 'e2' }),
          warning: undefined,
        }),
      );
      expect(undoSpy.softDelete).not.toHaveBeenCalled();
      http.expectNone((r) => r.method === 'DELETE');
      expect(entryRows().length).toBe(3);
    });

    it('warns when the entry is the current best', async () => {
      open([entry('e2', 1, 120, '2026-10-05', 'set-2')], {
        best: { exerciseId: 'squat', weightKg: 120, achievedOn: '2026-10-05' } as any,
      });
      removeFirst();
      await settle();
      expect(confirmSpy.confirm.calls.mostRecent().args[0].warning).toBe('Your current 1RM best · 120 kg');
    });

    it('a manual or program setup entry skips the sheet and goes to the undo toast', async () => {
      open([entry('e1', 1, 100, '2026-09-01')]);
      removeFirst();
      await settle();
      expect(confirmSpy.confirm).not.toHaveBeenCalled();
      expect(job()).toEqual(
        jasmine.objectContaining({ title: 'Entry removed', sub: '1 × 100 kg · Sep 1, 2026' }),
      );
    });

    it('hides the entry from the list and chart at once, sends the DELETE when the toast runs out, then reloads', async () => {
      open(entries());
      removeFirst();
      await settle();

      job().hide();
      fixture.detectChanges();
      expect(entryRows().length).toBe(2);
      expect(component.chartData.datasets[0].data.length).toBe(2);
      http.expectNone((r) => r.method === 'DELETE');

      job().commit().subscribe();
      const req = http.expectOne(`${environment.apiUrl}/lifts/rep-maxes/e2`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
      job().done!();
      http.expectOne(historyUrl).flush(history(entries().filter((e) => e.id !== 'e2')));
      fixture.detectChanges();

      expect(component.chartData.datasets[0].data.length).toBe(2);
      expect(entryRows().length).toBe(2);
      expect((fixture.nativeElement.querySelector('.latest-3') as HTMLElement).textContent).toContain('—');
    });

    it('Undo (or a failed DELETE) puts the entry back in the list and chart', async () => {
      open(entries());
      removeFirst();
      await settle();
      job().hide();
      job().restore();
      fixture.detectChanges();
      expect(entryRows().length).toBe(3);
      expect(component.chartData.datasets[0].data.length).toBe(3);
    });

    it('an entry still waiting for its toast stays hidden when the history reloads', async () => {
      open(entries());
      removeFirst();
      await settle();
      job().hide();
      (component as any).load();
      http.expectOne(historyUrl).flush(history(entries()));
      fixture.detectChanges();
      expect(entryRows().length).toBe(2);
    });
  });

  describe('range, hero and change', () => {
    const spread = () => [
      entry('older', 1, 90, '2026-03-01'),
      entry('aug', 1, 100, '2026-08-01'),
      entry('oct', 3, 100, '2026-10-05'),
    ];
    const xs = () => component.chartData.datasets[0].data.map((p) => p.x);
    const pick = (range: string) => {
      component.setRange(range);
      fixture.detectChanges();
    };
    const text = (selector: string) =>
      (fixture.nativeElement.querySelector(selector) as HTMLElement | null)?.textContent?.trim() ?? null;

    it('opens on 6 months and each range drops the older points', () => {
      open(spread());
      expect(component.range).toBe('6M');
      expect(xs()).toEqual([Date.UTC(2026, 7, 1), Date.UTC(2026, 9, 5)]);

      pick('1M');
      expect(xs()).toEqual([Date.UTC(2026, 9, 5)]);
      pick('All');
      expect(xs().length).toBe(3);
      pick('3M');
      expect(xs().length).toBe(2);
    });

    it("shows the range's highest e1RM and its change since the range's first point", () => {
      open(spread());
      // 3 × 100 kg = 110 kg e1RM; the range starts at 100 kg in August
      expect(text('.hero-value')).toBe('110');
      expect(text('.delta-chip')).toBe('+10 kg since Aug');
      expect(fixture.nativeElement.querySelector('.delta-chip').classList).toContain('up');

      pick('All');
      expect(text('.delta-chip')).toBe('+20 kg since Mar');

      pick('1M');
      expect(text('.hero-value')).toBe('110');
      expect(fixture.nativeElement.querySelector('.delta-chip')).toBeNull();
    });

    it('says No change when nothing in the range beat its first point, in pounds for an lb user', () => {
      open([entry('a', 1, 100, '2026-09-01'), entry('b', 1, 90, '2026-10-01')], { unit: 'lb' });
      expect(text('.hero-value')).toBe('220.5');
      expect(text('.hero-unit')).toBe('lb');
      expect(text('.delta-chip')).toBe('No change since Sep');
      expect(fixture.nativeElement.querySelector('.delta-chip').classList).not.toContain('up');
    });

    it('opens on All when the last 6 months have no entries', () => {
      open([entry('old', 1, 90, '2026-01-01')]);
      expect(component.range).toBe('All');
      expect(xs().length).toBe(1);
    });
  });

  describe('PR badge', () => {
    it("marks the entry the 1RM best comes from, and no other", () => {
      open(
        [
          entry('first', 1, 110, '2026-09-01'),
          entry('heavy-triple', 3, 110, '2026-09-20'),
          entry('later-same', 1, 110, '2026-09-25'),
        ],
        { best: { exerciseId: 'squat', weightKg: 110, unit: 'kg', achievedOn: '2026-09-01', source: 'MANUAL' } },
      );
      const badged = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.entry-row'))
        .filter((row) => row.querySelector('.entry-pr'))
        .map((row) => row.querySelector('.entry-date')!.textContent!.trim());
      expect(badged).toEqual(['Sep 1, 2026']);
    });
  });

  describe('adding an entry', () => {
    it('does not allow a day after today', () => {
      open([]);
      component.newEntry = { reps: 1, weight: 100, achievedOn: '2026-10-11' };
      expect(component.canAdd).toBeFalse();
      component.newEntry = { reps: 1, weight: 100, achievedOn: '2026-10-10' };
      expect(component.canAdd).toBeTrue();
    });

    it('the "+" sheet adds the entry it returns', async () => {
      open([]);
      sheetSpy.open.and.resolveTo({ data: { reps: 3, weight: 95, achievedOn: '2026-10-09' }, role: 'confirm' });

      await component.openAddEntry();

      const [, options] = sheetSpy.open.calls.mostRecent().args;
      expect(options.props).toEqual({ entry: { reps: 1, weight: null, achievedOn: jasmine.any(String) }, today: '2026-10-10' });
      const req = http.expectOne(`${environment.apiUrl}/lifts/rep-maxes`);
      expect(req.request.body).toEqual({ exerciseId: 'squat', reps: 3, weightKg: 95, achievedOn: '2026-10-09' });
      req.flush({ entry: entry('n', 3, 95, '2026-10-09'), best: null });
      http.expectOne(historyUrl).flush(history([entry('n', 3, 95, '2026-10-09')]));
    });

    it('closing the sheet adds nothing', async () => {
      open([]);
      sheetSpy.open.and.resolveTo({ role: 'cancel' });
      await component.openAddEntry();
      http.expectNone(`${environment.apiUrl}/lifts/rep-maxes`);
    });
  });
});
