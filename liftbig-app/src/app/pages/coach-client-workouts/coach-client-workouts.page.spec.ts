import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRoute,
  RouterLink,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { By } from '@angular/platform-browser';
import { AlertController, ToastController } from '@ionic/angular';
import { CoachClientWorkoutsPage } from './coach-client-workouts.page';
import { Workout, WorkoutSet } from '../../core/workout.service';
import { environment } from '../../../environments/environment';

const set = (made: boolean | null): WorkoutSet => ({
  id: `s-${Math.random()}`,
  reps: 5,
  weight: 100,
  order: 1,
  made,
  actualReps: null,
  actualWeight: null,
  notes: null,
});

const workout = (overrides: Partial<Workout>): Workout => ({
  id: 'w1',
  name: 'Week 1',
  date: '2030-01-01T00:00:00.000Z',
  status: 'PLANNED',
  totalWeightLifted: 0,
  assignedById: 'coach-1',
  assignedBy: { id: 'coach-1', name: 'Coach' },
  exercises: [],
  ...overrides,
});

describe('CoachClientWorkoutsPage', () => {
  let fixture: ComponentFixture<CoachClientWorkoutsPage>;
  let component: CoachClientWorkoutsPage;
  let httpMock: HttpTestingController;
  let alertSpy: jasmine.SpyObj<HTMLIonAlertElement>;
  let alertControllerSpy: jasmine.SpyObj<AlertController>;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  const listUrl = `${environment.apiUrl}/coach/clients/client-1/workouts`;

  beforeEach(() => {
    alertSpy = jasmine.createSpyObj('HTMLIonAlertElement', [
      'present',
      'onDidDismiss',
    ]);
    alertSpy.present.and.resolveTo();
    alertSpy.onDidDismiss.and.resolveTo({ role: 'destructive' } as any);
    alertControllerSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertControllerSpy.create.and.resolveTo(alertSpy);
    const toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();
    toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);

    TestBed.configureTestingModule({
      imports: [CoachClientWorkoutsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ clientId: 'client-1' }) },
          },
        },
        { provide: AlertController, useValue: alertControllerSpy },
        { provide: ToastController, useValue: toastControllerSpy },
      ],
    });
    fixture = TestBed.createComponent(CoachClientWorkoutsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const rows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.client-workout'));

  it('lists the assigned workouts with their status and logged/total sets', () => {
    httpMock.expectOne(listUrl).flush([
      workout({
        id: 'w1',
        name: 'Week 1',
        status: 'IN_PROGRESS',
        exercises: [
          {
            id: 'c1',
            exerciseId: 'e1',
            exercise: { id: 'e1', name: 'Squat' },
            order: 1,
            supersetGroup: null,
            sets: [set(true), set(false), set(null)],
          },
          {
            id: 'c2',
            exerciseId: 'e2',
            order: 2,
            supersetGroup: null,
            sets: [set(null), set(null)],
          },
        ],
      }),
      workout({ id: 'w2', name: 'Week 2', status: 'PLANNED' }),
    ]);
    fixture.detectChanges();

    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain('Week 1');
    expect(rows()[0].querySelector('.set-progress')?.textContent?.trim()).toBe(
      '2/5 sets',
    );
    expect(rows()[0].querySelector('ion-badge')?.textContent?.trim()).toBe(
      'IN_PROGRESS',
    );
    expect(rows()[1].querySelector('.set-progress')?.textContent?.trim()).toBe(
      '0/0 sets',
    );
  });

  it('links each workout to the editor and the add button to a new workout', () => {
    httpMock.expectOne(listUrl).flush([workout({ id: 'w1' })]);
    fixture.detectChanges();

    const links = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .map((de) => de.injector.get(RouterLink).urlTree?.toString());
    expect(links).toContain('/coach/workouts/w1');
    expect(links).toContain('/coach/clients/client-1/workouts/new');
  });

  it('shows an empty state', () => {
    httpMock.expectOne(listUrl).flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'No workouts assigned to this client yet.',
    );
  });

  it('deletes a workout after confirming and reloads the list', async () => {
    httpMock.expectOne(listUrl).flush([workout({ id: 'w1' })]);
    fixture.detectChanges();

    await component.deleteWorkout(workout({ id: 'w1' }));
    httpMock
      .expectOne({
        method: 'DELETE',
        url: `${environment.apiUrl}/coach/workouts/w1`,
      })
      .flush(null);
    httpMock.expectOne(listUrl).flush([]);
    fixture.detectChanges();
    expect(rows().length).toBe(0);
  });

  it('keeps the workout when the delete is cancelled', async () => {
    httpMock.expectOne(listUrl).flush([workout({ id: 'w1' })]);
    alertSpy.onDidDismiss.and.resolveTo({ role: 'cancel' } as any);

    await component.deleteWorkout(workout({ id: 'w1' }));
    httpMock.expectNone(`${environment.apiUrl}/coach/workouts/w1`);
  });
});
