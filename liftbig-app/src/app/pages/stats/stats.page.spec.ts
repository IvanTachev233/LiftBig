import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { StatsPage } from './stats.page';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';

describe('StatsPage', () => {
  let component: StatsPage;
  let fixture: ComponentFixture<StatsPage>;
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
      imports: [StatsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlertController, useValue: alertControllerSpy },
        { provide: ToastController, useValue: toastControllerSpy },
      ],
    });
    fixture = TestBed.createComponent(StatsPage);
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
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([]);
  });

  it('includes assigned workouts with the coach badge and no delete option', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([
      {
        id: 'assigned-1',
        name: 'Coach Squats',
        date: '2026-09-27',
        status: 'COMPLETED',
        totalWeightLifted: 300,
        assignedById: 'coach-1',
        assignedBy: { id: 'coach-1', name: 'Coach Carter' },
        exercises: [],
      },
      {
        id: 'workout-1',
        name: 'Leg Day',
        date: '2026-09-28',
        status: 'COMPLETED',
        totalWeightLifted: 500,
        assignedById: null,
        assignedBy: null,
        exercises: [],
      },
    ]);
    fixture.detectChanges();

    const items: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-workout-list-item'),
    );
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.coach-badge')?.textContent?.trim()).toBe(
      'Coach · Coach Carter',
    );
    expect(items[0].querySelector('ion-item-option')).toBeNull();
    expect(items[1].querySelector('.coach-badge')).toBeNull();
    expect(items[1].querySelector('ion-item-option')).toBeTruthy();
  });

  it('confirming delete on a workout card removes it from the rendered list', async () => {
    component.ionViewWillEnter();
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([
      {
        id: 'workout-1',
        name: 'Leg Day',
        date: '2026-09-28',
        status: 'COMPLETED',
        totalWeightLifted: 500,
        assignedById: null,
        assignedBy: null,
        exercises: [],
      },
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
    await flushMicrotasks(() => component.workouts?.length === 0);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('app-workout-list-item').length,
    ).toBe(0);
  });

  describe('page visits', () => {
    const workoutsUrl = `${environment.apiUrl}/workouts`;
    const completed = (id: string, name: string) => ({
      id,
      name,
      date: '2026-09-28',
      status: 'COMPLETED',
      totalWeightLifted: 500,
      assignedById: null,
      assignedBy: null,
      exercises: [],
    });

    it('makes no request until the page is entered', () => {
      httpMock.expectNone(workoutsUrl);
      component.ionViewWillEnter();
      httpMock.expectOne(workoutsUrl).flush([]);
    });

    it('reloads on every visit and keeps the current list while reloading', () => {
      component.ionViewWillEnter();
      httpMock.expectOne(workoutsUrl).flush([completed('w1', 'Leg Day')]);
      fixture.detectChanges();

      component.ionViewWillEnter();
      const reload = httpMock.expectOne(workoutsUrl);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelectorAll('app-workout-list-item').length,
      ).toBe(1);

      reload.flush([completed('w1', 'Leg Day'), completed('w2', 'Push Day')]);
      fixture.detectChanges();
      const items: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('app-workout-list-item'),
      );
      expect(items.length).toBe(2);
      expect(items[1].textContent).toContain('Push Day');
    });
  });

  describe('back button', () => {
    afterEach(() => {
      localStorage.removeItem('token');
    });

    const cases = [
      { role: 'COACH', url: '/coach/dashboard' },
      { role: 'CLIENT', url: '/dashboard' },
    ] as const;

    for (const { role, url } of cases) {
      it(`falls back to ${url} for a ${role}`, () => {
        component.ionViewWillEnter();
        httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([]);
        TestBed.inject(AuthService).setSession(fakeToken(role));
        fixture.detectChanges();

        expect(
          fixture.nativeElement.querySelector('ion-back-button').defaultHref,
        ).toBe(url);
      });
    }
  });
});
