import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { WorkoutListItemComponent } from './workout-list-item.component';
import { Workout } from '../../../core/workout.service';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { environment } from '../../../../environments/environment';

describe('WorkoutListItemComponent', () => {
  let component: WorkoutListItemComponent;
  let fixture: ComponentFixture<WorkoutListItemComponent>;
  let httpMock: HttpTestingController;
  let alertControllerSpy: jasmine.SpyObj<AlertController>;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  let alertSpy: jasmine.SpyObj<HTMLIonAlertElement>;
  let toastSpy: jasmine.SpyObj<HTMLIonToastElement>;

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

  function setAlertRole(role: string | undefined) {
    alertSpy.onDidDismiss.and.resolveTo({ role } as any);
  }

  // Polls until the condition holds; slider close() timing varies
  function flushMicrotasks(
    condition: () => boolean = () => true,
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

  beforeEach(async () => {
    alertSpy = jasmine.createSpyObj('HTMLIonAlertElement', [
      'present',
      'onDidDismiss',
    ]);
    alertSpy.present.and.resolveTo();
    setAlertRole('destructive');

    toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();

    alertControllerSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertControllerSpy.create.and.resolveTo(alertSpy);

    toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);

    await TestBed.configureTestingModule({
      imports: [WorkoutListItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlertController, useValue: alertControllerSpy },
        { provide: ToastController, useValue: toastControllerSpy },
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

    await component.confirmDelete();
    expect(alertControllerSpy.create).not.toHaveBeenCalled();
    httpMock.expectNone(`${environment.apiUrl}/workouts/${assigned.id}`);
  });

  it('confirming delete sends a DELETE request and emits deleted with the id', async () => {
    setAlertRole('destructive');
    const deletedSpy = jasmine.createSpy('deleted');
    component.deleted.subscribe(deletedSpy);

    await component.confirmDelete();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/workouts/${workout.id}`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await flushMicrotasks(() => deletedSpy.calls.count() > 0);

    expect(deletedSpy).toHaveBeenCalledWith(workout.id);
  });

  it('cancelling sends no request and does not emit deleted', async () => {
    setAlertRole('cancel');
    const deletedSpy = jasmine.createSpy('deleted');
    component.deleted.subscribe(deletedSpy);

    await component.confirmDelete();

    httpMock.expectNone(`${environment.apiUrl}/workouts/${workout.id}`);
    expect(deletedSpy).not.toHaveBeenCalled();
  });

  it('shows a toast and keeps the card when the delete request fails', async () => {
    setAlertRole('destructive');
    const deletedSpy = jasmine.createSpy('deleted');
    component.deleted.subscribe(deletedSpy);

    await component.confirmDelete();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/workouts/${workout.id}`,
    );
    req.flush('failed', { status: 500, statusText: 'Server Error' });
    await flushMicrotasks(() => toastControllerSpy.create.calls.count() > 0);

    expect(deletedSpy).not.toHaveBeenCalled();
    expect(toastControllerSpy.create).toHaveBeenCalled();
    expect(toastSpy.present).toHaveBeenCalled();
  });

  it('ignores a second tap on Delete while the first confirmation is still pending', async () => {
    setAlertRole('destructive');
    const deletedSpy = jasmine.createSpy('deleted');
    component.deleted.subscribe(deletedSpy);

    const firstCall = component.confirmDelete();
    const secondCall = component.confirmDelete();

    await Promise.all([firstCall, secondCall]);

    expect(alertControllerSpy.create).toHaveBeenCalledTimes(1);

    const reqs = httpMock.match(`${environment.apiUrl}/workouts/${workout.id}`);
    expect(reqs.length).toBeLessThanOrEqual(1);
    if (reqs.length === 1) {
      reqs[0].flush(null);
      await flushMicrotasks(() => deletedSpy.calls.count() > 0);
    }
  });

  it('allows a new delete confirmation after a previous one completed', async () => {
    setAlertRole('destructive');
    const deletedSpy = jasmine.createSpy('deleted');
    component.deleted.subscribe(deletedSpy);

    await component.confirmDelete();
    const req = httpMock.expectOne(
      `${environment.apiUrl}/workouts/${workout.id}`,
    );
    req.flush(null);
    await flushMicrotasks(() => deletedSpy.calls.count() > 0);

    setAlertRole('destructive');
    await component.confirmDelete();

    expect(alertControllerSpy.create).toHaveBeenCalledTimes(2);
    const req2 = httpMock.expectOne(
      `${environment.apiUrl}/workouts/${workout.id}`,
    );
    req2.flush(null);
    await flushMicrotasks(() => deletedSpy.calls.count() > 1);
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
      await component.confirmDelete();
      expect(alertControllerSpy.create).not.toHaveBeenCalled();
    });
  });
});
