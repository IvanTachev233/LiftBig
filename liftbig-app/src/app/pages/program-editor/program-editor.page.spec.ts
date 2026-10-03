import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { ProgramEditorPage } from './program-editor.page';
import {
  ExercisePickerComponent,
  ExercisePickerResult,
} from '../../shared/components/exercise-picker/exercise-picker.component';
import { environment } from '../../../environments/environment';

describe('ProgramEditorPage', () => {
  let component: ProgramEditorPage;
  let fixture: ComponentFixture<ProgramEditorPage>;
  let httpTesting: HttpTestingController;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let modalSpy: jasmine.SpyObj<HTMLIonModalElement>;

  const exercisesUrl = `${environment.apiUrl}/workouts/exercises`;
  const programsUrl = `${environment.apiUrl}/programs`;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function setup(params: { id?: string; clientId?: string }) {
    const toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();
    const toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);

    modalSpy = jasmine.createSpyObj<HTMLIonModalElement>('HTMLIonModalElement', [
      'present',
      'onWillDismiss',
    ]);
    modalSpy.present.and.resolveTo();
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['create']);
    modalCtrlSpy.create.and.resolveTo(modalSpy);

    TestBed.configureTestingModule({
      imports: [ProgramEditorPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(params.id ? { id: params.id } : {}),
              queryParamMap: convertToParamMap(
                params.clientId ? { clientId: params.clientId } : {},
              ),
            },
          },
        },
        { provide: ToastController, useValue: toastControllerSpy },
      ],
    });
    // IonicModule gives the standalone page its own ModalController, so a
    // root provider would be ignored
    TestBed.overrideComponent(ProgramEditorPage, {
      add: { providers: [{ provide: ModalController, useValue: modalCtrlSpy }] },
    });

    httpTesting = TestBed.inject(HttpTestingController);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(ProgramEditorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne(exercisesUrl).flush([
      { id: 'ex1', name: 'Bench Press' },
      { id: 'ex2', name: 'Row' },
      { id: 'ex3', name: 'Squat' },
    ]);
  }

  function setupWithProgram(exercises: any[]) {
    setup({ id: 'p1' });
    httpTesting.expectOne(`${programsUrl}/p1`).flush({
      id: 'p1',
      clientId: 'c1',
      name: 'Week 1',
      scheduledDate: '2026-10-05T00:00:00.000Z',
      exercises,
    });
    fixture.detectChanges();
  }

  function pickerReturns(data: ExercisePickerResult | null, role: string) {
    modalSpy.onWillDismiss.and.resolveTo({ data, role } as any);
  }

  function saveAndGetPut() {
    component.save();
    const req = httpTesting.expectOne(
      (r) => r.method === 'PUT' && r.url === `${programsUrl}/p1`,
    );
    const body = req.request.body;
    req.flush({});
    return body;
  }

  function row(id: string, exerciseId: string, name: string, order: number, supersetGroup: string | null) {
    return {
      id,
      exerciseId,
      exercise: { id: exerciseId, name, bodyPart: 'x' },
      reps: 5,
      weight: 100,
      notes: null,
      order,
      made: null,
      supersetGroup,
    };
  }

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    setup({ clientId: 'c1' });
    expect(component).toBeTruthy();
  });

  it('has no exercise ion-select; the Add Exercise button opens the picker and appends 2 returned exercises as 2 groups in order, each with one 5-rep set', async () => {
    setup({ clientId: 'c1' });
    pickerReturns(
      {
        exercises: [
          { id: 'ex3', name: 'Squat' },
          { id: 'ex1', name: 'Bench Press' },
        ],
        superset: false,
      },
      'confirm',
    );

    expect(fixture.nativeElement.querySelector('ion-select')).toBeNull();
    const button: HTMLElement = fixture.nativeElement.querySelector('.add-exercise-btn');
    expect(button.textContent).toContain('Add Exercise');
    button.click();
    await fixture.whenStable();

    expect(modalCtrlSpy.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ component: ExercisePickerComponent }),
    );
    expect(component.exerciseGroups.map((g) => g.exerciseName)).toEqual([
      'Squat',
      'Bench Press',
    ]);
    for (const g of component.exerciseGroups) {
      expect(g.sets).toEqual([{ reps: 5, weight: null, notes: '', made: null }]);
      expect(g.supersetGroup).toBeNull();
    }
  });

  it('dismissing the picker with nothing (back/cancel) changes nothing', async () => {
    setup({ clientId: 'c1' });
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);
    pickerReturns(null, 'cancel');

    await component.openExercisePicker();

    expect(component.exerciseGroups.length).toBe(1);
    expect(component.exerciseGroups[0].exerciseId).toBe('ex1');
  });

  it('adds a coach-created exercise returned by the picker to the exercise list', async () => {
    setup({ clientId: 'c1' });
    pickerReturns(
      { exercises: [{ id: 'new1', name: 'LB21 Test Lift', createdById: 'coach1' }], superset: false },
      'confirm',
    );

    await component.openExercisePicker();

    expect(component.exerciseGroups[0].exerciseName).toBe('LB21 Test Lift');
    expect(component.exercisesList.some((e) => e.id === 'new1')).toBeTrue();
  });

  it('a new program POSTs supersetGroup null on every row when there is no superset', () => {
    setup({ clientId: 'c1' });
    component.programName = 'Week 1';
    component.addExercises([
      { id: 'ex1', name: 'Bench Press' },
      { id: 'ex2', name: 'Row' },
    ]);

    component.save();

    const req = httpTesting.expectOne((r) => r.method === 'POST' && r.url === programsUrl);
    expect(req.request.body.exercises.length).toBe(2);
    expect(
      req.request.body.exercises.every((e: any) => e.supersetGroup === null),
    ).toBeTrue();
    req.flush({});
  });

  it('a superset of 2 gives both groups one shared id, and the PUT body has it on every set of both', async () => {
    setupWithProgram([row('r1', 'ex3', 'Squat', 1, null)]);
    pickerReturns(
      {
        exercises: [
          { id: 'ex1', name: 'Bench Press' },
          { id: 'ex2', name: 'Row' },
        ],
        superset: true,
      },
      'confirm',
    );

    await component.openExercisePicker();

    const [, a, b] = component.exerciseGroups;
    expect(a.supersetGroup).toMatch(uuidPattern);
    expect(b.supersetGroup).toBe(a.supersetGroup);
    component.addSet(a);

    const body = saveAndGetPut();
    expect(body.exercises.map((e: any) => [e.exerciseId, e.supersetGroup])).toEqual([
      ['ex3', null],
      ['ex1', a.supersetGroup],
      ['ex1', a.supersetGroup],
      ['ex2', a.supersetGroup],
    ]);
  });

  it('loading a program whose rows share a supersetGroup renders one superset block with both members next to each other', () => {
    const sg = '11111111-1111-4111-8111-111111111111';
    setupWithProgram([
      row('r1', 'ex1', 'Bench Press', 1, sg),
      row('r2', 'ex3', 'Squat', 2, null),
      row('r3', 'ex2', 'Row', 3, sg),
    ]);

    const blocks = fixture.nativeElement.querySelectorAll('.superset-block');
    expect(blocks.length).toBe(1);
    expect(blocks[0].querySelector('.superset-label').textContent).toContain('SUPERSET');
    const titles = Array.from(blocks[0].querySelectorAll('.exercise-title')).map(
      (el: any) => el.textContent.trim(),
    );
    expect(titles).toEqual(['Bench Press', 'Row']);
    expect(component.exerciseGroups.map((g) => g.exerciseId)).toEqual(['ex1', 'ex2', 'ex3']);
  });

  it('removing 1 of 2 superset exercises clears the remaining group, and the next PUT sends supersetGroup null', () => {
    const sg = '22222222-2222-4222-8222-222222222222';
    setupWithProgram([
      row('r1', 'ex1', 'Bench Press', 1, sg),
      row('r2', 'ex2', 'Row', 2, sg),
    ]);

    component.removeExercise(0);
    fixture.detectChanges();

    expect(component.exerciseGroups[0].supersetGroup).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(0);
    const body = saveAndGetPut();
    expect(body.exercises.length).toBe(1);
    expect(body.exercises[0]).toEqual(
      jasmine.objectContaining({ id: 'r2', exerciseId: 'ex2', supersetGroup: null }),
    );
  });

  it('move arrows reorder inside a superset, and move a single card past a whole superset block', () => {
    const sg = '33333333-3333-4333-8333-333333333333';
    setupWithProgram([
      row('r1', 'ex1', 'Bench Press', 1, sg),
      row('r2', 'ex2', 'Row', 2, sg),
      row('r3', 'ex3', 'Squat', 3, null),
    ]);
    const ids = () => component.exerciseGroups.map((g) => g.exerciseId);

    component.moveDown(0); // inside the superset
    expect(ids()).toEqual(['ex2', 'ex1', 'ex3']);

    component.moveUp(2); // Squat jumps over the whole superset
    expect(ids()).toEqual(['ex3', 'ex2', 'ex1']);

    component.moveUp(1); // top member: the whole superset moves up past Squat
    expect(ids()).toEqual(['ex2', 'ex1', 'ex3']);

    component.moveDown(1); // bottom member: the whole superset moves down past Squat
    expect(ids()).toEqual(['ex3', 'ex2', 'ex1']);
    expect(component.exerciseGroups[1].supersetGroup).toBe(sg);
    expect(component.exerciseGroups[2].supersetGroup).toBe(sg);
  });
});
