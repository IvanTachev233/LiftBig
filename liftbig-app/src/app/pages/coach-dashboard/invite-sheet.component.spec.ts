import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController, ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { Invite } from '../../core/client.service';
import { InviteSheetComponent } from './invite-sheet.component';

const invite: Invite = {
  id: 'i1',
  coachId: 'coach-1',
  clientEmail: 'dan@example.com',
  token: '3f2c9a1e-0b7d-4c55-9e2a-6d1f0c8b7a44',
  status: 'PENDING',
  createdAt: '2030-01-01T00:00:00.000Z',
  expiresAt: '2030-01-08T12:00:00.000Z',
};

describe('InviteSheetComponent', () => {
  let fixture: ComponentFixture<InviteSheetComponent>;
  let component: InviteSheetComponent;
  let http: HttpTestingController;
  let modals: jasmine.SpyObj<ModalController>;
  let toasts: jasmine.SpyObj<ToastController>;
  const invitesUrl = `${environment.apiUrl}/auth/invites`;

  function create(props: Partial<InviteSheetComponent> = {}) {
    modals = jasmine.createSpyObj('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    toasts = jasmine.createSpyObj('ToastController', ['create']);
    toasts.create.and.resolveTo({ present: () => Promise.resolve() } as any);
    TestBed.configureTestingModule({
      imports: [InviteSheetComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastController, useValue: toasts },
      ],
    });
    // IonicModule provides ModalController on the component, so a root provider is ignored
    TestBed.overrideComponent(InviteSheetComponent, {
      add: { providers: [{ provide: ModalController, useValue: modals }] },
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InviteSheetComponent);
    component = fixture.componentInstance;
    Object.assign(component, props);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const primary = () => el('app-bottom-sheet ion-button.btn-primary') as HTMLIonButtonElement;

  function typeEmail(value: string) {
    el('ion-input.invite-email')!.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    fixture.detectChanges();
  }

  it('asks for the email with a helper that promises no email', () => {
    create();
    expect(el('.sheet-title')!.textContent!.trim()).toBe('Invite a client');
    const helper = el('.sheet-helper')!.textContent!;
    expect(helper).toContain('invite code');
    expect(helper).toContain('No email is sent');
    expect(primary().textContent!.trim()).toBe('Send invite');
  });

  it('keeps Send invite disabled until the email looks valid', () => {
    create();
    expect(primary().disabled).toBeTrue();

    for (const bad of ['dan', 'dan@', 'dan@example', 'dan @example.com', '   ']) {
      typeEmail(bad);
      expect(primary().disabled).withContext(bad).toBeTrue();
    }
    component.send();
    http.expectNone(invitesUrl);

    typeEmail(' dan@example.com ');
    expect(primary().disabled).toBeFalse();
  });

  it('sends the trimmed email, shows the returned code and reports the invite to the page', () => {
    const created = jasmine.createSpy('created');
    create({ created });
    typeEmail(' dan@example.com ');
    primary().click();

    const req = http.expectOne({ method: 'POST', url: invitesUrl });
    expect(req.request.body).toEqual({ email: 'dan@example.com' });
    fixture.detectChanges();
    expect(primary().disabled).withContext('while sending').toBeTrue();
    req.flush(invite);
    fixture.detectChanges();

    expect(created).toHaveBeenCalledOnceWith(invite);
    expect(el('.sheet-title')!.textContent!.trim()).toBe('Invite created');
    expect(el('.code-value')!.textContent!.trim()).toBe(invite.token);
    expect(el('.sheet-helper')!.textContent).toContain('dan@example.com');
    expect(el('ion-input')).toBeNull();
    expect(primary().textContent!.trim()).toBe('Done');
    expect(modals.dismiss).not.toHaveBeenCalled();
  });

  it('shows the API error in a toast and keeps the sheet open with the email', async () => {
    const created = jasmine.createSpy('created');
    create({ created });
    typeEmail('dan@example.com');
    component.send();
    http
      .expectOne(invitesUrl)
      .flush(
        { message: 'A pending invite already exists for this email' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toasts.create).toHaveBeenCalledWith(
      jasmine.objectContaining({
        message: 'A pending invite already exists for this email',
        color: 'danger',
      }),
    );
    expect(created).not.toHaveBeenCalled();
    expect(modals.dismiss).not.toHaveBeenCalled();
    expect(el('ion-input.invite-email')).toBeTruthy();
    expect(component.email).toBe('dan@example.com');
    expect(primary().disabled).toBeFalse();
  });

  it('opened with a pending invite shows its code, copies it and closes with Done', async () => {
    create({ invite });
    const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();

    expect(el('.sheet-title')!.textContent!.trim()).toBe('Invite code');
    expect(el('.code-value')!.textContent!.trim()).toBe(invite.token);
    expect(el('ion-input')).toBeNull();

    const copy = el('ion-button.copy-btn')!;
    expect(copy.textContent!.trim()).toBe('Copy code');
    copy.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(write).toHaveBeenCalledOnceWith(invite.token);
    expect(copy.textContent!.trim()).toBe('Copied');

    primary().click();
    expect(modals.dismiss).toHaveBeenCalledOnceWith(invite, 'confirm');
  });

  it('a failed copy says so in a toast', async () => {
    create({ invite });
    spyOn(navigator.clipboard, 'writeText').and.rejectWith(new Error('denied'));

    await component.copy(invite.token);

    expect(component.copied).toBeFalse();
    expect(toasts.create).toHaveBeenCalledWith(jasmine.objectContaining({ color: 'danger' }));
  });
});
