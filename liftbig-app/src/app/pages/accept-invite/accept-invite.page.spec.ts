import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AcceptInvitePage } from './accept-invite.page';

describe('AcceptInvitePage', () => {
  let fixture: ComponentFixture<AcceptInvitePage>;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;

  function open(token: string) {
    TestBed.configureTestingModule({
      imports: [AcceptInvitePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(AcceptInvitePage);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('accepts the invite, says so and goes to Today', fakeAsync(() => {
    open('tok');
    http.expectOne(`${environment.apiUrl}/auth/invites/tok/accept`).flush({ user: {}, access_token: '' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-icon[name="checkmark-circle"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe('Invite accepted');
    tick(2000);
    expect(navigate).toHaveBeenCalledWith(['/today']);
  }));

  it('shows the error with a button to Today', () => {
    open('bad');
    http
      .expectOne(`${environment.apiUrl}/auth/invites/bad/accept`)
      .flush({ message: 'Invite expired' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.invite-message').textContent.trim()).toBe('Invite expired');
    const button = fixture.debugElement.query(By.css('ion-button.btn-primary'));
    expect(button.nativeElement.textContent.trim()).toBe('Go to Today');
    expect(button.injector.get(RouterLink).urlTree?.toString()).toBe('/today');
  });
});
