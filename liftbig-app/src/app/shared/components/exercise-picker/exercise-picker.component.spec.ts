import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController } from '@ionic/angular';
import { ExercisePickerComponent } from './exercise-picker.component';
import { ExerciseDetailModalComponent } from '../exercise-detail-modal/exercise-detail-modal.component';
import { CreateExerciseModalComponent } from '../create-exercise-modal/create-exercise-modal.component';
import { AuthService, User } from '../../../core/auth.service';
import { Exercise } from '../../../core/workout.service';
import { environment } from '../../../../environments/environment';

describe('ExercisePickerComponent', () => {
  let component: ExercisePickerComponent;
  let fixture: ComponentFixture<ExercisePickerComponent>;
  let httpMock: HttpTestingController;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let childModalSpy: jasmine.SpyObj<HTMLIonModalElement>;
  let currentUser: User | null;

  const coach: User = { id: 'coach-1', email: 'c@example.test', role: 'COACH' };
  const client: User = { id: 'client-1', email: 'k@example.test', role: 'CLIENT', coachId: 'coach-1' };

  const exercises: Exercise[] = [
    { id: 'e1', name: 'Back Squat', imageUrl: 'https://cdn.example.com/squat.png' },
    { id: 'e2', name: 'Bench Press' },
    { id: 'e3', name: 'Deadlift' },
    { id: 'e4', name: 'Front Squat' },
    { id: 'e5', name: 'Overhead Press' },
  ];

  function setup(options: { user?: User | null; exercises?: Exercise[] | undefined } = {}) {
    currentUser = 'user' in options ? (options.user ?? null) : coach;
    fixture = TestBed.createComponent(ExercisePickerComponent);
    component = fixture.componentInstance;
    if ('exercises' in options) {
      component.exercises = options.exercises;
    } else {
      component.exercises = exercises;
    }
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
  }

  function el(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rowNames(): string[] {
    return Array.from(el().querySelectorAll('.exercise-row-name')).map((n) =>
      (n.textContent ?? '').trim(),
    );
  }

  function row(name: string): HTMLElement {
    const rows = Array.from(el().querySelectorAll<HTMLElement>('.exercise-row'));
    const found = rows.find((r) =>
      (r.querySelector('.exercise-row-name')?.textContent ?? '').trim() === name,
    );
    if (!found) throw new Error(`row not found: ${name}`);
    return found;
  }

  function checkbox(name: string): HTMLIonCheckboxElement {
    return row(name).querySelector('ion-checkbox') as HTMLIonCheckboxElement;
  }

  function clickRow(name: string) {
    (row(name).querySelector('.exercise-row-name') as HTMLElement).click();
    fixture.detectChanges();
  }

  function search(value: string | null) {
    const searchbar = el().querySelector('ion-searchbar') as Element;
    searchbar.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    fixture.detectChanges();
  }

  function addButton(): HTMLIonButtonElement {
    return el().querySelector('.add-button') as HTMLIonButtonElement;
  }

  function supersetButton(): HTMLIonButtonElement {
    return el().querySelector('.superset-button') as HTMLIonButtonElement;
  }

  // Lets the awaited modal calls settle
  function settle(condition: () => boolean, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (condition()) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error('settle: timed out'));
        setTimeout(check, 10);
      };
      check();
    });
  }

  beforeEach(async () => {
    childModalSpy = jasmine.createSpyObj('HTMLIonModalElement', ['present', 'onWillDismiss']);
    childModalSpy.present.and.resolveTo();
    childModalSpy.onWillDismiss.and.resolveTo({ data: undefined, role: 'cancel' });

    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['create', 'dismiss']);
    modalCtrlSpy.create.and.resolveTo(childModalSpy);
    modalCtrlSpy.dismiss.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [ExercisePickerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ModalController, useValue: modalCtrlSpy },
        { provide: AuthService, useValue: { currentUser: () => currentUser } },
      ],
    })
      // IonicModule provides its own ModalController to standalone components,
      // so the spy has to be provided on the component itself
      .overrideComponent(ExercisePickerComponent, {
        add: { providers: [{ provide: ModalController, useValue: modalCtrlSpy }] },
      })
      .compileComponents();
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('loading', () => {
    it('renders the exercises passed in without requesting them', () => {
      setup();
      httpMock.expectNone(`${environment.apiUrl}/workouts/exercises`);
      expect(rowNames()).toEqual(exercises.map((e) => e.name));
    });

    it('loads the exercises from the service when none are passed in', () => {
      setup({ exercises: undefined });
      const req = httpMock.expectOne(`${environment.apiUrl}/workouts/exercises`);
      expect(req.request.method).toBe('GET');
      req.flush(exercises.slice(0, 2));
      expect(rowNames()).toEqual(['Back Squat', 'Bench Press']);
    });

    it('shows an error with Retry when loading fails', () => {
      setup({ exercises: undefined });
      httpMock
        .expectOne(`${environment.apiUrl}/workouts/exercises`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      expect(el().querySelector('.load-error')?.textContent).toContain('Could not load exercises');

      (el().querySelector('.retry-button') as HTMLElement).click();
      httpMock.expectOne(`${environment.apiUrl}/workouts/exercises`).flush(exercises);
      expect(rowNames().length).toBe(exercises.length);
    });
  });

  describe('rows', () => {
    beforeEach(() => setup());

    it('shows the 40px thumbnail when imageUrl is set and a placeholder otherwise', () => {
      const img = row('Back Squat').querySelector('img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('https://cdn.example.com/squat.png');
      expect(row('Back Squat').querySelector('.thumb-placeholder')).toBeNull();

      expect(row('Bench Press').querySelector('img')).toBeNull();
      expect(row('Bench Press').querySelector('.thumb-placeholder')).toBeTruthy();
    });

    it('labels the info button and the checkbox for screen readers', () => {
      const info = row('Deadlift').querySelector('.info-button') as HTMLElement;
      expect(info.getAttribute('aria-label')).toBe('Details for Deadlift');
      expect(checkbox('Deadlift').getAttribute('aria-label')).toBe('Select Deadlift');
    });
  });

  describe('search', () => {
    beforeEach(() => setup());

    it('typing "squat" leaves only matching rows, ignoring case', () => {
      search('squat');
      expect(rowNames()).toEqual(['Back Squat', 'Front Squat']);

      search('SQUAT');
      expect(rowNames()).toEqual(['Back Squat', 'Front Squat']);
    });

    it('filters on every keystroke and the clear button resets the list', () => {
      search('e');
      expect(rowNames()).toEqual(['Bench Press', 'Deadlift', 'Overhead Press']);
      search('es');
      expect(rowNames()).toEqual(['Bench Press', 'Overhead Press']);

      // The clear (x) button empties the value and fires ionInput
      search('');
      expect(rowNames()).toEqual(exercises.map((e) => e.name));
      search(null);
      expect(rowNames()).toEqual(exercises.map((e) => e.name));
    });

    it('shows "No exercises match" when nothing matches', () => {
      search('zzz');
      expect(rowNames()).toEqual([]);
      expect(el().querySelector('.empty-state')?.textContent).toContain('No exercises match');
    });

    it('keeps selections made before filtering', () => {
      clickRow('Deadlift');
      search('squat');
      clickRow('Front Squat');
      search('');
      expect(checkbox('Deadlift').checked).toBeTrue();
      expect(checkbox('Front Squat').checked).toBeTrue();
    });
  });

  describe('selection and header buttons', () => {
    beforeEach(() => setup());

    it('Add is disabled at 0 selected and Superset below 2', () => {
      expect(addButton().disabled).toBeTrue();
      expect(supersetButton().disabled).toBeTrue();

      clickRow('Deadlift');
      expect(addButton().disabled).toBeFalse();
      expect(supersetButton().disabled).toBeTrue();

      clickRow('Bench Press');
      expect(addButton().disabled).toBeFalse();
      expect(supersetButton().disabled).toBeFalse();

      clickRow('Bench Press');
      expect(supersetButton().disabled).toBeTrue();
    });

    it('tapping a row toggles its checkbox', () => {
      clickRow('Deadlift');
      expect(checkbox('Deadlift').checked).toBeTrue();
      clickRow('Deadlift');
      expect(checkbox('Deadlift').checked).toBeFalse();
    });

    it('the checkbox ionChange sets the selection without the row click toggling it back', () => {
      const box = checkbox('Overhead Press');
      box.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: true } }));
      // A real tap on the checkbox also fires a click that bubbles to the row
      box.click();
      fixture.detectChanges();
      expect(checkbox('Overhead Press').checked).toBeTrue();

      box.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: false } }));
      box.click();
      fixture.detectChanges();
      expect(checkbox('Overhead Press').checked).toBeFalse();
    });

    it('Add dismisses with the exercises in selection order and superset false', () => {
      clickRow('Overhead Press');
      clickRow('Back Squat');
      clickRow('Deadlift');

      addButton().click();

      expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(
        { exercises: [exercises[4], exercises[0], exercises[2]], superset: false },
        'confirm',
      );
    });

    it('Superset dismisses with the selection and superset true', () => {
      clickRow('Front Squat');
      clickRow('Bench Press');

      supersetButton().click();

      expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(
        { exercises: [exercises[3], exercises[1]], superset: true },
        'confirm',
      );
    });

    it('does not dismiss from add()/superset() below their thresholds', () => {
      component.add();
      clickRow('Deadlift');
      component.addAsSuperset();
      expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
    });

    it('back dismisses with nothing and the cancel role', () => {
      clickRow('Deadlift');
      (el().querySelector('.back-button') as HTMLElement).click();
      expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(null, 'cancel');
    });
  });

  describe('info button', () => {
    beforeEach(() => setup());

    it('opens the detail modal and does not toggle selection', async () => {
      const info = row('Deadlift').querySelector('.info-button') as HTMLElement;
      info.click();
      fixture.detectChanges();

      expect(checkbox('Deadlift').checked).toBeFalse();
      expect(addButton().disabled).toBeTrue();
      await settle(() => childModalSpy.present.calls.count() > 0);
      expect(modalCtrlSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({
          component: ExerciseDetailModalComponent,
          componentProps: { exercise: exercises[2] },
        }),
      );
    });

    it('does not untoggle an already selected row', () => {
      clickRow('Deadlift');
      (row('Deadlift').querySelector('.info-button') as HTMLElement).click();
      fixture.detectChanges();
      expect(checkbox('Deadlift').checked).toBeTrue();
    });
  });

  describe('Create New Exercise card', () => {
    it('renders for a COACH', () => {
      setup({ user: coach });
      expect(el().querySelector('.create-card')?.textContent).toContain('Create New Exercise');
    });

    it('does not render for a CLIENT', () => {
      setup({ user: client });
      expect(el().querySelector('.create-card')).toBeNull();
    });

    it('does not render without a user', () => {
      setup({ user: null });
      expect(el().querySelector('.create-card')).toBeNull();
    });

    it('a created exercise appears in sorted position, checked, at the end of the selection order', async () => {
      setup({ user: coach });
      clickRow('Overhead Press');
      const created: Exercise = { id: 'new-1', name: 'barbell Row', createdById: 'coach-1' };
      childModalSpy.onWillDismiss.and.resolveTo({ data: created, role: 'confirm' });

      (el().querySelector('.create-card') as HTMLElement).click();
      await settle(() => rowNames().includes('barbell Row'));

      expect(modalCtrlSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ component: CreateExerciseModalComponent }),
      );
      expect(rowNames()).toEqual([
        'Back Squat',
        'barbell Row',
        'Bench Press',
        'Deadlift',
        'Front Squat',
        'Overhead Press',
      ]);
      expect(checkbox('barbell Row').checked).toBeTrue();

      addButton().click();
      expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith(
        { exercises: [exercises[4], created], superset: false },
        'confirm',
      );
    });

    it('clears a search that would hide the created exercise', async () => {
      setup({ user: coach });
      search('squat');
      const created: Exercise = { id: 'new-2', name: 'Zercher Lunge' };
      childModalSpy.onWillDismiss.and.resolveTo({ data: created, role: 'confirm' });

      await component.openCreate();
      fixture.detectChanges();

      expect(rowNames()).toContain('Zercher Lunge');
      expect(rowNames().length).toBe(exercises.length + 1);
    });

    it('cancelling the create modal changes nothing', async () => {
      setup({ user: coach });
      childModalSpy.onWillDismiss.and.resolveTo({ data: null, role: 'cancel' });

      await component.openCreate();

      expect(rowNames()).toEqual(exercises.map((e) => e.name));
      expect(addButton().disabled).toBeTrue();
    });
  });
});
