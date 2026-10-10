import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { WeightUnitService } from '../../core/weight-unit.service';
import { ProfilePage } from './profile.page';

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let component: ProfilePage;
  let http: HttpTestingController;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  const url = `${environment.apiUrl}/users/me`;
  const profile = {
    id: 'u1',
    email: 'una@x.io',
    name: 'Una',
    role: 'CLIENT',
    weightUnit: 'kg',
  };

  beforeEach(() => {
    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.resolveTo({ present: () => Promise.resolve() } as any);
    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toastCtrl },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfilePage);
    component = fixture.componentInstance;
    component.ionViewWillEnter();
    http.expectOne(url).flush(profile);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const text = (selector: string) =>
    (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();

  it('shows the name and email read-only', () => {
    expect(text('.profile-name')).toBe('Una');
    expect(text('.profile-email')).toBe('una@x.io');
    expect(fixture.nativeElement.querySelector('ion-input')).toBeNull();
  });

  it('saves a new unit and applies it', () => {
    component.changeUnit('lb');
    const req = http.expectOne(url);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ weightUnit: 'lb' });
    req.flush({ ...profile, weightUnit: 'lb' });
    expect(TestBed.inject(WeightUnitService).unit()).toBe('lb');
    expect(component.unit).toBe('lb');
  });

  it('reverts the toggle and shows a toast when saving fails', async () => {
    component.changeUnit('lb');
    http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(component.unit).toBe('kg');
    expect(TestBed.inject(WeightUnitService).unit()).toBe('kg');
    expect(toastCtrl.create).toHaveBeenCalled();
  });
});
