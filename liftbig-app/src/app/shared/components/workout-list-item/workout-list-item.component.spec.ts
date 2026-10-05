import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { WorkoutListItemComponent } from './workout-list-item.component';
import { Workout } from '../../../core/workout.service';
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

  it('renders the workout card', () => {
    const card = fixture.nativeElement.querySelector('app-workout-card');
    expect(card).toBeTruthy();
  });

  it('shows no coach badge and offers delete on a self-made workout', () => {
    expect(fixture.nativeElement.querySelector('.coach-badge')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-item-option')).toBeTruthy();
    const sliding = fixture.nativeElement.querySelector('ion-item-sliding');
    expect(sliding.disabled).toBeFalsy();
  });

  it('shows a "Coach · name" badge on an assigned workout', () => {
    showWorkout(assigned);
    const badge = fixture.nativeElement.querySelector('.coach-badge');
    expect(badge?.textContent.trim()).toBe('Coach · Coach Carter');
  });

  it('falls back to "Coach" when the coach has no name', () => {
    showWorkout({ ...assigned, assignedBy: { id: 'coach-1', name: null } });
    const badge = fixture.nativeElement.querySelector('.coach-badge');
    expect(badge?.textContent.trim()).toBe('Coach');
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
});
