import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { DashboardPage } from './dashboard.page';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';
import { Workout } from '../../core/workout.service';
import { environment } from '../../../environments/environment';

const workout = (overrides: Partial<Workout>): Workout => ({
  id: 'w',
  name: 'Workout',
  date: '2030-01-01T00:00:00.000Z',
  status: 'PLANNED',
  totalWeightLifted: 0,
  assignedById: null,
  assignedBy: null,
  exercises: [],
  ...overrides,
});

describe('DashboardPage', () => {
  let component: DashboardPage;
  let fixture: ComponentFixture<DashboardPage>;
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
      imports: [DashboardPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlertController, useValue: alertControllerSpy },
        { provide: ToastController, useValue: toastControllerSpy },
      ],
    });
    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    component.ionViewWillEnter();
    expect(component).toBeTruthy();
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([]);
  });

  it('loads one upcoming list and no programs', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([]);
    httpMock.expectNone(`${environment.apiUrl}/programs/upcoming`);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Programs');
  });

  it('mixes own and assigned upcoming workouts sorted by date, badging only the assigned ones', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([
      workout({ id: 'own-late', name: 'Own late', date: '2030-01-03T00:00:00.000Z' }),
      workout({
        id: 'assigned-early',
        name: 'Assigned early',
        date: '2030-01-01T00:00:00.000Z',
        assignedById: 'coach-1',
        assignedBy: { id: 'coach-1', name: 'Coach Carter' },
      }),
      workout({ id: 'own-mid', name: 'Own mid', date: '2030-01-02T00:00:00.000Z' }),
    ]);
    fixture.detectChanges();

    const items: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-workout-list-item'),
    );
    expect(items.map((el) => el.querySelector('ion-card-title')?.textContent?.trim())).toEqual([
      'Assigned early',
      'Own mid',
      'Own late',
    ]);
    expect(items.map((el) => !!el.querySelector('.coach-badge'))).toEqual([true, false, false]);
  });

  it('offers no delete option on an assigned workout', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([
      workout({ id: 'a1', assignedById: 'coach-1', assignedBy: { id: 'coach-1', name: 'C' } }),
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-item-option')).toBeNull();
  });

  it('reloads the upcoming list after accepting an invite', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([]);
    component.inviteToken = 'token-1';
    component.acceptInvite();
    httpMock
      .expectOne(`${environment.apiUrl}/auth/invites/token-1/accept`)
      .flush({ user: {}, access_token: '' });
    httpMock
      .expectOne(`${environment.apiUrl}/workouts/upcoming`)
      .flush([workout({ id: 'a1', assignedById: 'coach-1', assignedBy: null })]);
    expect(component.upcomingWorkouts?.map((w) => w.id)).toEqual(['a1']);
  });

  it('confirming delete on a workout card removes it from the rendered list', async () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([
      workout({ id: 'workout-1', name: 'Leg Day', date: '2026-09-28' }),
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
    await flushMicrotasks(() => component.upcomingWorkouts?.length === 0);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('app-workout-list-item').length,
    ).toBe(0);
  });

  describe('page visits', () => {
    const upcomingUrl = `${environment.apiUrl}/workouts/upcoming`;

    it('makes no request until the page is entered', () => {
      httpMock.expectNone(upcomingUrl);
      component.ionViewWillEnter();
      httpMock.expectOne(upcomingUrl).flush([]);
    });

    it('reloads on every visit and keeps the current list while reloading', () => {
      component.ionViewWillEnter();
      httpMock
        .expectOne(upcomingUrl)
        .flush([workout({ id: 'w1', name: 'Leg Day' })]);
      fixture.detectChanges();

      component.ionViewWillEnter();
      const reload = httpMock.expectOne(upcomingUrl);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('app-workout-list-item').length,
      ).toBe(1);

      reload.flush([
        workout({ id: 'w1', name: 'Leg Day' }),
        workout({ id: 'w2', name: 'Push Day', date: '2030-01-02T00:00:00.000Z' }),
      ]);
      fixture.detectChanges();
      const items: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('app-workout-list-item'),
      );
      expect(items.length).toBe(2);
      expect(items[1].textContent).toContain('Push Day');
    });
  });
});
