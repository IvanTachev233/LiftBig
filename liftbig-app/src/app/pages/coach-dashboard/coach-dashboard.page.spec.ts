import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { CoachDashboardPage } from './coach-dashboard.page';
import { Client, Invite } from '../../core/client.service';
import { environment } from '../../../environments/environment';

const client = (id: string, name: string): Client => ({
  id,
  name,
  email: `${id}@example.com`,
  role: 'CLIENT',
});

const invite = (id: string, clientEmail: string): Invite => ({
  id,
  coachId: 'coach-1',
  clientEmail,
  token: `token-${id}`,
  status: 'PENDING',
  createdAt: '2030-01-01T00:00:00.000Z',
  expiresAt: '2030-01-08T00:00:00.000Z',
});

describe('CoachDashboardPage', () => {
  let fixture: ComponentFixture<CoachDashboardPage>;
  let component: CoachDashboardPage;
  let httpMock: HttpTestingController;
  let alertSpy: jasmine.SpyObj<HTMLIonAlertElement>;
  let alertControllerSpy: jasmine.SpyObj<AlertController>;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  const clientsUrl = `${environment.apiUrl}/auth/clients`;
  const invitesUrl = `${environment.apiUrl}/auth/invites`;

  beforeEach(() => {
    alertSpy = jasmine.createSpyObj('HTMLIonAlertElement', ['present']);
    alertSpy.present.and.resolveTo();
    alertControllerSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertControllerSpy.create.and.resolveTo(alertSpy);
    const toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();
    toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);

    TestBed.configureTestingModule({
      imports: [CoachDashboardPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AlertController, useValue: alertControllerSpy },
        { provide: ToastController, useValue: toastControllerSpy },
      ],
    });
    fixture = TestBed.createComponent(CoachDashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const cards = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.client-card'));

  function enterAndFlush(clients: Client[], invites: Invite[] = []) {
    component.ionViewWillEnter();
    httpMock.expectOne(clientsUrl).flush(clients);
    httpMock.expectOne(invitesUrl).flush(invites);
    fixture.detectChanges();
  }

  it('makes no request until the page is entered', () => {
    httpMock.expectNone(clientsUrl);
    httpMock.expectNone(invitesUrl);
    enterAndFlush([client('c1', 'Alice')], [invite('i1', 'bob@example.com')]);

    expect(cards().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('bob@example.com');
  });

  it('reloads on every visit and keeps the current list while reloading', () => {
    enterAndFlush([client('c1', 'Alice')]);

    component.ionViewWillEnter();
    const clientsReload = httpMock.expectOne(clientsUrl);
    const invitesReload = httpMock.expectOne(invitesUrl);
    fixture.detectChanges();
    expect(cards().length).toBe(1);

    clientsReload.flush([client('c1', 'Alice'), client('c2', 'Carol')]);
    invitesReload.flush([]);
    fixture.detectChanges();
    expect(cards().length).toBe(2);
    expect(cards()[1].textContent).toContain('Carol');
  });

  it('reloads both lists once after removing a client', async () => {
    enterAndFlush([client('c1', 'Alice')]);

    await component.removeClient('c1');
    const [{ buttons }] = alertControllerSpy.create.calls.mostRecent().args as any;
    buttons.find((b: any) => b.role === 'destructive').handler();

    httpMock
      .expectOne({ method: 'DELETE', url: `${clientsUrl}/c1` })
      .flush(null);
    httpMock.expectOne(clientsUrl).flush([]);
    httpMock.expectOne(invitesUrl).flush([]);
    fixture.detectChanges();
    expect(cards().length).toBe(0);
  });
});
