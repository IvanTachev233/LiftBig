import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { WorkoutListItemComponent } from './workout-list-item.component';
import { Workout } from '../../../core/workout.service';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { environment } from '../../../../environments/environment';
import { ConfirmSheetService } from '../../ui/confirm-sheet.component';

describe('WorkoutListItemComponent', () => {
  let component: WorkoutListItemComponent;
  let fixture: ComponentFixture<WorkoutListItemComponent>;
  let httpMock: HttpTestingController;
  let sheetSpy: jasmine.SpyObj<ConfirmSheetService>;

  const workout: Workout = {
    id: 'workout-1',
    name: 'Leg Day',
    date: '2026-09-28',
    status: 'PLANNED',
    totalWeightLifted: 0,
    assignedById: null,
    assignedBy: null,
    exercises: [],
  };

  const assigned: Workout = {
    ...workout,
    id: 'assigned-1',
    name: 'Coach Squats',
    assignedById: 'coach-1',
    assignedBy: { id: 'coach-1', name: 'Coach Carter' },
  };

  function showWorkout(w: Workout) {
    fixture.componentRef.setInput('workout', w);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    sheetSpy = jasmine.createSpyObj('ConfirmSheetService', ['confirm']);
    sheetSpy.confirm.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [WorkoutListItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ConfirmSheetService, useValue: sheetSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkoutListItemComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('workout', workout);
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a date-block row with the workout name', () => {
    const row = fixture.nativeElement.querySelector('app-date-block-row');
    expect(row.querySelector('.row-title').textContent.trim()).toBe('Leg Day');
    expect(row.querySelector('time').getAttribute('datetime')).toBe('2026-09-28');
  });

  describe('status line and volume', () => {
    // Saturday 10 Oct 2026, a minute before midnight on the device
    const today = new Date(2026, 9, 10, 23, 59);

    function sub() {
      const el = fixture.nativeElement.querySelector('.row-sub');
      return [el.textContent.trim(), el.classList.contains('tone-accent'), el.classList.contains('tone-muted')];
    }

    beforeEach(() => fixture.componentRef.setInput('today', today));

    it('shows Completed with the exercise count, In progress, Missed, Today and Planned', () => {
      const cards = [1, 2, 3].map((n) => ({ id: `c${n}` }) as any);
      showWorkout({ ...workout, status: 'COMPLETED', exercises: cards });
      expect(sub()).toEqual(['Completed · 3 exercises', false, false]);

      showWorkout({ ...workout, status: 'COMPLETED', exercises: [cards[0]] });
      expect(sub()).toEqual(['Completed · 1 exercise', false, false]);

      showWorkout({ ...workout, status: 'IN_PROGRESS' });
      expect(sub()).toEqual(['In progress', true, false]);

      showWorkout({ ...workout, date: '2026-10-09T00:00:00.000Z' });
      expect(sub()).toEqual(['Missed', false, true]);

      showWorkout({ ...workout, date: '2026-10-10T00:00:00.000Z' });
      expect(sub()).toEqual(['Today', false, false]);
    });

    it("shows the volume in the user's unit", () => {
      showWorkout({ ...workout, totalWeightLifted: 1157 });
      const volume = () =>
        [
          fixture.nativeElement.querySelector('.row-volume .num').textContent.trim(),
          fixture.nativeElement.querySelector('.row-volume .volume-unit').textContent.trim(),
        ];
      expect(volume()).toEqual(['1,157', 'kg']);

      TestBed.inject(WeightUnitService).setUnit('lb');
      fixture.componentRef.setInput('workout', { ...workout, totalWeightLifted: 500 });
      fixture.detectChanges();
      expect(volume()).toEqual(['1,102', 'lb']);
    });
  });

  it('opens the workout in the logger on tap', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture.nativeElement.querySelector('ion-item').click();
    const [url] = (router.navigateByUrl as jasmine.Spy).calls.mostRecent().args;
    expect(router.serializeUrl(url)).toBe('/workout-logger?id=workout-1');
  });

  it('shows no coach badge and offers delete on a self-made workout', () => {
    expect(fixture.nativeElement.querySelector('.coach-badge')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-item-option')).toBeTruthy();
    const sliding = fixture.nativeElement.querySelector('ion-item-sliding');
    expect(sliding.disabled).toBeFalsy();
  });

  it('shows a Coach tag on an assigned workout, with or without a coach name', () => {
    showWorkout(assigned);
    expect(fixture.nativeElement.querySelector('.coach-badge')?.textContent.trim()).toBe('Coach');
    showWorkout({ ...assigned, assignedBy: { id: 'coach-1', name: null } });
    expect(fixture.nativeElement.querySelector('.coach-badge')?.textContent.trim()).toBe('Coach');
  });

  it('offers no swipe delete on an assigned workout', async () => {
    showWorkout(assigned);
    expect(fixture.nativeElement.querySelector('ion-item-option')).toBeNull();
    const sliding = fixture.nativeElement.querySelector('ion-item-sliding');
    expect(sliding.disabled).toBeTrue();

    const requested = jasmine.createSpy('deleteRequested');
    component.deleteRequested.subscribe(requested);
    await component.requestDelete();
    expect(sheetSpy.confirm).not.toHaveBeenCalled();
    expect(requested).not.toHaveBeenCalled();
  });

  describe('delete', () => {
    const set = (made: boolean | null, extra = {}) => ({
      id: `s-${Math.random()}`,
      reps: 1,
      weight: 120,
      order: 1,
      made,
      actualReps: null,
      actualWeight: null,
      notes: null,
      ...extra,
    });
    const card = (name: string, sets: any[]) => ({
      id: `c-${name}`,
      exerciseId: name,
      exercise: { id: name, name },
      order: 1,
      supersetGroup: null,
      sets,
    });
    let requested: jasmine.Spy;

    beforeEach(() => {
      requested = jasmine.createSpy('deleteRequested');
      component.deleteRequested.subscribe(requested);
    });

    it('the swipe button is labelled with the workout and asks the page to delete', () => {
      const option = fixture.nativeElement.querySelector('ion-item-option') as HTMLElement;
      expect(option.getAttribute('aria-label')).toBe('Delete Leg Day');
      expect(option.textContent!.trim()).toBe('Delete');
    });

    it('a planned workout without logged sets skips the sheet', async () => {
      await component.requestDelete();
      expect(sheetSpy.confirm).not.toHaveBeenCalled();
      expect(requested).toHaveBeenCalledOnceWith(workout);
      // The page sends the delete after the undo toast
      httpMock.expectNone(`${environment.apiUrl}/workouts/${workout.id}`);
    });

    it('a completed workout asks first, showing its row, and goes on only when confirmed', async () => {
      const done = { ...workout, status: 'COMPLETED' as const };
      showWorkout(done);
      sheetSpy.confirm.and.resolveTo(false);
      await component.requestDelete();

      const [options] = sheetSpy.confirm.calls.mostRecent().args;
      expect(options).toEqual(
        jasmine.objectContaining({
          title: 'Delete this workout?',
          message: 'Its sets will be removed from your history and lift records.',
          confirmLabel: 'Delete workout',
          summary: component.row,
          summaryContext: done,
          warning: undefined,
        }),
      );
      expect(requested).not.toHaveBeenCalled();

      sheetSpy.confirm.and.resolveTo(true);
      await component.requestDelete();
      expect(requested).toHaveBeenCalledOnceWith(done);
    });

    it('an in-progress workout with a logged set asks first', async () => {
      showWorkout({ ...workout, status: 'IN_PROGRESS', exercises: [card('Squat', [set(false)])] });
      await component.requestDelete();
      expect(sheetSpy.confirm).toHaveBeenCalledTimes(1);
    });

    it('warns about the PR the workout holds, in the user\'s unit', async () => {
      showWorkout({
        ...workout,
        status: 'COMPLETED',
        exercises: [
          card('Squat', [set(true)]),
          card('Bench Press', [set(true, { pb: true, actualWeight: 123 }), set(true, { pb: true })]),
        ],
      });
      await component.requestDelete();
      expect(sheetSpy.confirm.calls.mostRecent().args[0].warning).toBe(
        'Includes your Bench Press PR · 123 kg, and 1 more',
      );

      TestBed.inject(WeightUnitService).setUnit('lb');
      showWorkout({ ...workout, status: 'COMPLETED', exercises: [card('Bench Press', [set(true, { pb: true })])] });
      await component.requestDelete();
      expect(sheetSpy.confirm.calls.mostRecent().args[0].warning).toBe(
        'Includes your Bench Press PR · 264.6 lb',
      );
    });

    it('ignores a second Delete while the sheet is open', async () => {
      showWorkout({ ...workout, status: 'COMPLETED' });
      let answer!: (v: boolean) => void;
      sheetSpy.confirm.and.returnValue(new Promise((r) => (answer = r)));
      const first = component.requestDelete();
      await component.requestDelete();
      expect(sheetSpy.confirm).toHaveBeenCalledTimes(1);
      answer(true);
      await first;
      expect(requested).toHaveBeenCalledTimes(1);

      // A later Delete asks again
      sheetSpy.confirm.and.resolveTo(false);
      await component.requestDelete();
      expect(sheetSpy.confirm).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a trophy labelled "Has a personal best" when the workout has one', () => {
    showWorkout({ ...workout, hasPb: true });
    const trophy = fixture.nativeElement.querySelector('.pb-trophy');
    expect(trophy?.getAttribute('aria-label')).toBe('Has a personal best');
  });

  it('shows no trophy when hasPb is false or missing', () => {
    expect(fixture.nativeElement.querySelector('.pb-trophy')).toBeNull();
    showWorkout({ ...workout, hasPb: false });
    expect(fixture.nativeElement.querySelector('.pb-trophy')).toBeNull();
  });

  describe('program workout', () => {
    const program: Workout = {
      ...workout,
      id: 'program-1',
      name: 'Sample: Squat Day',
      source: 'program',
      program: { enrollmentId: 'en1', name: 'Sample Powerlifting Program' },
    };

    it('shows a Program tag', () => {
      showWorkout(program);
      const badge = fixture.nativeElement.querySelector('.program-badge');
      expect(badge?.textContent.trim()).toBe('Program');
      expect(fixture.nativeElement.querySelector('.coach-badge')).toBeNull();
    });

    it('offers no swipe delete', async () => {
      showWorkout(program);
      expect(fixture.nativeElement.querySelector('ion-item-options')).toBeNull();
      await component.requestDelete();
      expect(sheetSpy.confirm).not.toHaveBeenCalled();
    });
  });
});
