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
import { environment } from '../../../environments/environment';

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
    expect(component).toBeTruthy();
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([]);
    httpMock
      .match(`${environment.apiUrl}/programs/upcoming`)
      .forEach((req) => req.flush([]));
  });

  it('confirming delete on a workout card removes it from the rendered list', async () => {
    httpMock.expectOne(`${environment.apiUrl}/workouts/upcoming`).flush([
      {
        id: 'workout-1',
        name: 'Leg Day',
        date: '2026-09-28',
        status: 'PLANNED',
        totalWeightLifted: 0,
      },
    ]);
    httpMock
      .match(`${environment.apiUrl}/programs/upcoming`)
      .forEach((req) => req.flush([]));
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
});
