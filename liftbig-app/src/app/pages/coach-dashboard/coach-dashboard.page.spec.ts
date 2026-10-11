import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { RouterLink, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { ToastController } from '@ionic/angular';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { InviteSheetComponent } from './invite-sheet.component';
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
  let sheetSpy: jasmine.SpyObj<BottomSheetService>;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  const clientsUrl = `${environment.apiUrl}/auth/clients`;
  const invitesUrl = `${environment.apiUrl}/auth/invites`;

  beforeEach(() => {
    sheetSpy = jasmine.createSpyObj('BottomSheetService', ['open']);
    sheetSpy.open.and.resolveTo({ role: 'cancel' });
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
        { provide: BottomSheetService, useValue: sheetSpy },
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

  describe('search', () => {
    const search = (value: string) => {
      const bar = fixture.nativeElement.querySelector('ion-searchbar') as HTMLElement;
      bar.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
      fixture.detectChanges();
    };
    const titles = () =>
      cards().map((c) => c.querySelector('.client-title')!.textContent!.trim());

    beforeEach(() => {
      enterAndFlush([
        client('c1', 'Alice Rivera'),
        { id: 'c2', name: null, email: 'Bob.Stone@Example.com', role: 'CLIENT' },
        client('c3', 'Carol'),
      ]);
    });

    it('filters by name or email, ignoring case', () => {
      search('ALICE');
      expect(titles()).toEqual(['Alice Rivera']);

      search('bob.stone');
      expect(titles()).toEqual(['Bob.Stone@Example.com']);

      // c3's email is c3@example.com
      search('C3@EXAMPLE');
      expect(titles()).toEqual(['Carol']);

      search('');
      expect(cards().length).toBe(3);
    });

    it('says so when nothing matches', () => {
      search('zzz');
      expect(cards().length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain('No clients match “zzz”.');
    });
  });

  it('shows client cards with initials, name or email and a chevron, linking to their workouts, with no remove button', () => {
    enterAndFlush([client('c1', 'Alice Rivera'), { id: 'c2', name: null, email: 'bob@x.io', role: 'CLIENT' }]);

    const [alice, bob] = cards();
    expect(alice.querySelector('.client-avatar')!.textContent!.trim()).toBe('AR');
    expect(alice.querySelector('.client-title')!.textContent!.trim()).toBe('Alice Rivera');
    expect(alice.querySelector('.client-sub')!.textContent!.trim()).toBe('c1@example.com');
    expect(bob.querySelector('.client-avatar')!.textContent!.trim()).toBe('B');
    expect(bob.querySelector('.client-title')!.textContent!.trim()).toBe('bob@x.io');
    expect(bob.querySelector('.client-sub')).toBeNull();
    expect(alice.querySelector('ion-icon[name="chevron-forward"]')).toBeTruthy();
    for (const card of cards()) {
      expect(card.querySelectorAll('button, ion-button').length).toBe(0);
    }
    expect(fixture.nativeElement.querySelector('[name="person-remove-outline"]')).toBeNull();

    const links = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .map((de) => de.injector.get(RouterLink).urlTree?.toString());
    expect(links).toEqual(['/coach/clients/c1/workouts', '/coach/clients/c2/workouts']);
  });

  it('shows the empty state without clients', () => {
    enterAndFlush([]);
    expect(fixture.nativeElement.querySelector('ion-searchbar')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No clients yet. Invite your first client.');
  });

  it('tapping a pending invite opens the sheet with its code', () => {
    const pending = invite('i1', 'bob@example.com');
    enterAndFlush([], [pending]);

    const row = fixture.nativeElement.querySelector('.pending-invite') as HTMLElement;
    expect(row.textContent).toContain('bob@example.com');
    expect(row.textContent).toContain('Pending');
    row.click();

    expect(sheetSpy.open).toHaveBeenCalledOnceWith(InviteSheetComponent, {
      label: 'Invite code',
      props: { invite: pending },
    });
  });

  it('the Invite button opens the invite sheet, and a created invite reloads the pending invites only', () => {
    enterAndFlush([client('c1', 'Alice')]);

    const button = fixture.nativeElement.querySelector('ion-button.invite-btn') as HTMLElement;
    expect(button.textContent!.trim()).toBe('Invite');
    button.click();

    expect(sheetSpy.open).toHaveBeenCalledOnceWith(InviteSheetComponent, {
      label: 'Invite a client',
      props: { created: jasmine.any(Function) },
    });
    const { created } = sheetSpy.open.calls.mostRecent().args[1].props as any;
    created(invite('i2', 'dan@example.com'));
    httpMock.expectNone(clientsUrl);
    httpMock.expectOne(invitesUrl).flush([invite('i2', 'dan@example.com')]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pending-invite')!.textContent).toContain(
      'dan@example.com',
    );
  });

  it('has no floating action button', () => {
    enterAndFlush([]);
    expect(fixture.nativeElement.querySelector('ion-fab')).toBeNull();
  });
});
