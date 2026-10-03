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

describe('StatsPage', () => {
  let component: StatsPage;
  let fixture: ComponentFixture<StatsPage>;
  let httpMock: HttpTestingController;
  let alertControllerSpy: jasmine.SpyObj<AlertController>;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  let alertSpy: jasmine.SpyObj<HTMLIonAlertElement>;
  let toastSpy: jasmine.SpyObj<HTMLIonToastElement>;

  // Polls instead of a fixed delay because ion-item-sliding's close() can
  // take longer than one macrotask under load (e.g. full-suite runs).
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
    expect(component).toBeTruthy();
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([]);
  });

  it('confirming delete on a workout card removes it from the rendered list', async () => {
    httpMock.expectOne(`${environment.apiUrl}/workouts`).flush([
      {
        id: 'workout-1',
        name: 'Leg Day',
        date: '2026-09-28',
        status: 'COMPLETED',
        totalWeightLifted: 500,
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
});
