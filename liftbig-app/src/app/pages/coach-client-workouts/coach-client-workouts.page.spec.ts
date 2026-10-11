import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { By } from '@angular/platform-browser';
import { AlertController, ToastController } from '@ionic/angular';
import { CoachClientWorkoutsPage } from './coach-client-workouts.page';
import { Workout, WorkoutSet } from '../../core/workout.service';
import { Client } from '../../core/client.service';
import { OverflowMenuService } from '../../shared/ui/overflow-menu.service';
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
  let menuSpy: jasmine.SpyObj<OverflowMenuService>;
  let navigateSpy: jasmine.Spy;
  const listUrl = `${environment.apiUrl}/coach/clients/client-1/workouts`;
  const clientsUrl = `${environment.apiUrl}/auth/clients`;
  const alice: Client = { id: 'client-1', name: 'Alice Rivera', email: 'alice@example.com', role: 'CLIENT' };

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
    menuSpy = jasmine.createSpyObj('OverflowMenuService', ['open']);
    menuSpy.open.and.resolveTo(null);

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
        { provide: OverflowMenuService, useValue: menuSpy },
      ],
    });
    navigateSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CoachClientWorkoutsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
    // The client for the header, from the coach's client list
    httpMock.expectOne(clientsUrl).flush([alice]);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  const rows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.client-workout'));

  it('lists the assigned workouts with their status and logged/total sets', () => {
    component.ionViewWillEnter();
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
    expect(rows()[0].querySelector('app-status-pill')?.textContent?.trim()).toBe(
      'In progress',
    );
    expect(rows()[1].querySelector('.set-progress')?.textContent?.trim()).toBe(
      '0/0 sets',
    );
  });

  it('links each workout to the editor and Assign workout to a new workout', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(listUrl).flush([workout({ id: 'w1' })]);
    fixture.detectChanges();

    const links = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .map((de) => de.injector.get(RouterLink).urlTree?.toString());
    expect(links).toContain('/coach/workouts/w1');
    expect(links).toContain('/coach/clients/client-1/workouts/new');
  });

  it('shows an empty state', () => {
    component.ionViewWillEnter();
    httpMock.expectOne(listUrl).flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'No workouts assigned to this client yet.',
    );
  });

  it('deletes a workout after confirming and reloads the list', async () => {
    component.ionViewWillEnter();
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
    component.ionViewWillEnter();
    httpMock.expectOne(listUrl).flush([workout({ id: 'w1' })]);
    alertSpy.onDidDismiss.and.resolveTo({ role: 'cancel' } as any);

    await component.deleteWorkout(workout({ id: 'w1' }));
    httpMock.expectNone(`${environment.apiUrl}/coach/workouts/w1`);
  });

  describe('page visits', () => {
    it('makes no request until the page is entered', () => {
      httpMock.expectNone(listUrl);
      component.ionViewWillEnter();
      httpMock.expectOne(listUrl).flush([]);
    });

    it('reloads on every visit and keeps the current list while reloading', () => {
      component.ionViewWillEnter();
      httpMock.expectOne(listUrl).flush([workout({ id: 'w1', name: 'Week 1' })]);
      fixture.detectChanges();

      component.ionViewWillEnter();
      const reload = httpMock.expectOne(listUrl);
      fixture.detectChanges();
      expect(rows().length).toBe(1);

      reload.flush([
        workout({ id: 'w1', name: 'Week 1' }),
        workout({ id: 'w2', name: 'Week 2' }),
      ]);
      fixture.detectChanges();
      expect(rows().length).toBe(2);
      expect(rows()[1].textContent).toContain('Week 2');
    });
  });

  function enter(workouts: Workout[]) {
    component.ionViewWillEnter();
    httpMock.expectOne(listUrl).flush(workouts);
    fixture.detectChanges();
  }

  const titles = () =>
    rows().map((r) => r.querySelector('.workout-title')!.textContent!.trim());

  function logged(done: number, total: number) {
    return [
      {
        id: 'c1',
        exerciseId: 'e1',
        order: 1,
        supersetGroup: null,
        sets: Array.from({ length: total }, (_, i) => set(i < done ? true : null)),
      },
    ];
  }

  describe('client header', () => {
    it('shows initials, name, email and the date of the last workout the client logged', () => {
      enter([
        workout({ id: 'w3', name: 'Next', status: 'PLANNED', date: '2026-10-20T00:00:00.000Z' }),
        workout({ id: 'w2', name: 'Day 1', status: 'COMPLETED', date: '2026-10-07T00:00:00.000Z' }),
        workout({ id: 'w1', name: 'Day 0', status: 'IN_PROGRESS', date: '2026-10-01T00:00:00.000Z' }),
      ]);

      const header = fixture.nativeElement.querySelector('.client-header') as HTMLElement;
      expect(header.querySelector('.client-avatar')!.textContent!.trim()).toBe('AR');
      expect(header.querySelector('h1')!.textContent!.trim()).toBe('Alice Rivera');
      expect(header.querySelector('.client-email')!.textContent!.trim()).toBe('alice@example.com');
      expect(header.querySelector('.client-sub')!.textContent!.trim()).toBe(
        'Client · last workout Wed 7 Oct',
      );
    });

    it('shows the email as the title without a name, and no date before anything is logged', () => {
      httpMock.verify();
      // A fresh page whose client has no name
      fixture = TestBed.createComponent(CoachClientWorkoutsPage);
      component = fixture.componentInstance;
      fixture.detectChanges();
      httpMock.expectOne(clientsUrl).flush([{ ...alice, name: null }]);
      enter([workout({ status: 'PLANNED' })]);

      const header = fixture.nativeElement.querySelector('.client-header') as HTMLElement;
      expect(header.querySelector('h1')!.textContent!.trim()).toBe('alice@example.com');
      expect(header.querySelector('.client-email')).toBeNull();
      expect(header.querySelector('.client-avatar')!.textContent!.trim()).toBe('A');
      expect(header.querySelector('.client-sub')!.textContent!.trim()).toBe('Client');
    });
  });

  it('has an Assign workout button, no Program button and no floating button', () => {
    enter([]);
    const assign = fixture.nativeElement.querySelector('.assign-btn') as HTMLElement;
    expect(assign.textContent!.trim()).toBe('Assign workout');
    expect(assign.classList).toContain('btn-primary');
    expect(fixture.nativeElement.textContent).not.toContain('Program');
    expect(fixture.nativeElement.querySelector('ion-fab')).toBeNull();
  });

  describe('filter', () => {
    function choose(value: string) {
      const segment = fixture.nativeElement.querySelector('ion-segment.workout-filter') as HTMLElement;
      segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
      fixture.detectChanges();
    }

    beforeEach(() => {
      enter([
        workout({ id: 'w1', name: 'Done', status: 'COMPLETED', exercises: logged(2, 2) }),
        workout({ id: 'w2', name: 'Going', status: 'IN_PROGRESS', exercises: logged(1, 3) }),
        workout({ id: 'w3', name: 'Planned', status: 'PLANNED' }),
      ]);
    });

    it('shows All, Open (not completed) or Completed workouts', () => {
      const labels = Array.from(
        fixture.nativeElement.querySelectorAll('ion-segment.workout-filter ion-segment-button'),
      ).map((b: any) => b.textContent.trim());
      expect(labels).toEqual(['All', 'Open', 'Completed']);
      expect(titles()).toEqual(['Done', 'Going', 'Planned']);

      choose('open');
      expect(titles()).toEqual(['Going', 'Planned']);

      choose('completed');
      expect(titles()).toEqual(['Done']);

      choose('all');
      expect(titles()).toEqual(['Done', 'Going', 'Planned']);
    });

    it('says when a filter has nothing to show', () => {
      choose('completed');
      expect(fixture.nativeElement.textContent).not.toContain('No completed workouts');

      enter([workout({ id: 'w3', name: 'Planned', status: 'PLANNED' })]);
      expect(rows().length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain('No completed workouts yet.');
    });
  });

  it('shows each workout with its date, coach status word and a logged/all sets bar', () => {
    enter([
      workout({ id: 'w1', name: 'Done', status: 'COMPLETED', date: '2026-10-07T00:00:00.000Z', exercises: logged(2, 2) }),
      workout({ id: 'w2', name: 'Past plan', status: 'PLANNED', date: '2020-01-01T00:00:00.000Z', exercises: logged(0, 4) }),
    ]);

    const [done, planned] = rows();
    expect(done.querySelector('.workout-date')!.textContent!.trim()).toBe('Wed 7 Oct 2026');
    expect(done.querySelector('app-status-pill')!.textContent!.trim()).toBe('Completed');
    // Coaches see Not started, never Missed
    expect(planned.querySelector('app-status-pill')!.textContent!.trim()).toBe('Not started');

    const bar = (row: HTMLElement) => row.querySelector('[role="progressbar"]')!;
    expect(bar(done).getAttribute('aria-valuenow')).toBe('2');
    expect(bar(done).getAttribute('aria-valuemax')).toBe('2');
    expect(bar(planned).getAttribute('aria-valuenow')).toBe('0');
    expect(bar(planned).getAttribute('aria-valuemax')).toBe('4');
    expect(planned.querySelector('.set-progress')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('0/4 sets');
  });

  it('deletes by swiping: the Delete option asks, then sends the same request as before', async () => {
    enter([workout({ id: 'w1', name: 'Week 1' })]);

    const option = fixture.nativeElement.querySelector(
      'ion-item-option[aria-label="Delete Week 1"]',
    ) as HTMLElement;
    expect(option).toBeTruthy();
    expect(rows()[0].querySelector('[name="trash-outline"]')).toBeNull();
    option.click();
    await fixture.whenStable();

    expect(alertControllerSpy.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ header: 'Delete workout?' }),
    );
    httpMock
      .expectOne({ method: 'DELETE', url: `${environment.apiUrl}/coach/workouts/w1` })
      .flush(null);
    httpMock.expectOne(listUrl).flush([]);
  });

  describe('Remove client', () => {
    async function chooseRemove(alertRole: string) {
      alertSpy.onDidDismiss.and.resolveTo({ role: alertRole } as any);
      menuSpy.open.and.resolveTo('remove');
      (fixture.nativeElement.querySelector('ion-button.client-menu-btn') as HTMLElement).click();
      await fixture.whenStable();
    }

    beforeEach(() => enter([]));

    it('is the only item of the header menu, in the danger colour', async () => {
      await chooseRemove('cancel');
      const [actions] = menuSpy.open.calls.mostRecent().args;
      expect(actions).toEqual([{ id: 'remove', text: 'Remove client', destructive: true }]);
    });

    it('asks first, removes the client with DELETE /auth/clients/:id and goes back to Clients', async () => {
      await chooseRemove('destructive');

      expect(alertControllerSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ header: 'Remove client?' }),
      );
      httpMock.expectOne({ method: 'DELETE', url: `${clientsUrl}/client-1` }).flush(null);
      await fixture.whenStable();
      expect(navigateSpy).toHaveBeenCalledOnceWith(['/coach/clients']);
      expect(toastControllerSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Client removed', color: 'success' }),
      );
    });

    it('cancelling the confirm keeps the client', async () => {
      await chooseRemove('cancel');
      httpMock.expectNone(`${clientsUrl}/client-1`);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('closing the menu asks nothing', async () => {
      menuSpy.open.and.resolveTo(null);
      (fixture.nativeElement.querySelector('ion-button.client-menu-btn') as HTMLElement).click();
      await fixture.whenStable();
      expect(alertControllerSpy.create).not.toHaveBeenCalled();
    });

    it('a failed remove shows a toast and stays', async () => {
      await chooseRemove('destructive');
      httpMock
        .expectOne({ method: 'DELETE', url: `${clientsUrl}/client-1` })
        .flush(null, { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(toastControllerSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ color: 'danger' }),
      );
    });
  });
});
