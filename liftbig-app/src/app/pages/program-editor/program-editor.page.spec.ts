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
import {
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
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
  let alertCtrlSpy: jasmine.SpyObj<AlertController>;

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
    alertCtrlSpy = jasmine.createSpyObj('AlertController', ['create']);

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
        { provide: AlertController, useValue: alertCtrlSpy },
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

  function programResponse(exercises: any[]) {
    return {
      id: 'p1',
      clientId: 'c1',
      coachId: 'coach1',
      name: 'Week 1',
      scheduledDate: '2026-10-05T00:00:00.000Z',
      exercises,
    };
  }

  function setupWithProgram(exercises: any[]) {
    setup({ id: 'p1' });
    httpTesting.expectOne(`${programsUrl}/p1`).flush(programResponse(exercises));
    fixture.detectChanges();
  }

  // A fresh editor opening p1, which the API now returns with these cards
  function reopen(exercises: any[]) {
    fixture = TestBed.createComponent(ProgramEditorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne(exercisesUrl).flush([
      { id: 'ex1', name: 'Bench Press' },
      { id: 'ex2', name: 'Row' },
      { id: 'ex3', name: 'Squat' },
    ]);
    httpTesting.expectOne(`${programsUrl}/p1`).flush(programResponse(exercises));
    fixture.detectChanges();
  }

  function pickerReturns(data: ExercisePickerResult | null, role: string) {
    modalSpy.onWillDismiss.and.resolveTo({ data, role } as any);
  }

  // Saves, answers the PUT with `respond(body)` and returns the request body
  function saveAndGetPut(respond: (body: any) => any = () => ({})) {
    component.save();
    const req = httpTesting.expectOne(
      (r) => r.method === 'PUT' && r.url === `${programsUrl}/p1`,
    );
    const body = req.request.body;
    req.flush(respond(body));
    return body;
  }

  const names: Record<string, string> = {
    ex1: 'Bench Press',
    ex2: 'Row',
    ex3: 'Squat',
  };

  // What the API returns for a PUT body: rows without an id get a new one
  function apiResponse(body: any) {
    let n = 0;
    return programResponse(
      body.exercises.map((c: any) => {
        const id = c.id ?? `new-card-${++n}`;
        return {
          ...c,
          id,
          programId: 'p1',
          exercise: { id: c.exerciseId, name: names[c.exerciseId] },
          supersetGroup: c.supersetGroup ?? null,
          sets: c.sets.map((s: any) => ({
            id: s.id ?? `new-set-${++n}`,
            programExerciseId: id,
            reps: s.reps,
            weight: s.weight ?? null,
            notes: s.notes ?? null,
            order: s.order,
            made: null,
          })),
        };
      }),
    );
  }

  function set(id: string, order: number, overrides: any = {}) {
    return { id, reps: 5, weight: 100, notes: null, order, made: null, ...overrides };
  }

  function card(
    id: string,
    exerciseId: string,
    name: string,
    order: number,
    supersetGroup: string | null,
    sets: any[] = [set(`${id}-s1`, 1)],
  ) {
    return {
      id,
      programId: 'p1',
      exerciseId,
      exercise: { id: exerciseId, name, bodyPart: 'x' },
      order,
      supersetGroup,
      sets: sets.map((s) => ({ ...s, programExerciseId: id })),
    };
  }

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    setup({ clientId: 'c1' });
    expect(component).toBeTruthy();
  });

  it('has no exercise ion-select; the Add Exercise button opens the picker and appends 2 returned exercises as 2 cards in order, each with one 5-rep set', async () => {
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
      expect(g.id).toBeUndefined();
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

  it('a new program POSTs nested cards in order with no ids, set order from 1 and supersetGroup null when there is no superset', () => {
    setup({ clientId: 'c1' });
    component.programName = 'Week 1';
    component.scheduledDate = '2026-10-05T00:00:00.000Z';
    component.addExercises([
      { id: 'ex1', name: 'Bench Press' },
      { id: 'ex2', name: 'Row' },
    ]);
    component.addSet(component.exerciseGroups[1]);

    component.save();

    const req = httpTesting.expectOne((r) => r.method === 'POST' && r.url === programsUrl);
    expect(req.request.body).toEqual({
      clientId: 'c1',
      name: 'Week 1',
      scheduledDate: '2026-10-05T00:00:00.000Z',
      exercises: [
        {
          exerciseId: 'ex1',
          order: 1,
          supersetGroup: null,
          sets: [{ reps: 5, weight: null, notes: null, order: 1 }],
        },
        {
          exerciseId: 'ex2',
          order: 2,
          supersetGroup: null,
          sets: [
            { reps: 5, weight: null, notes: null, order: 1 },
            { reps: 5, weight: null, notes: null, order: 2 },
          ],
        },
      ],
    });
    req.flush({});
  });

  it('a superset of 2 gives both cards one shared id, and the PUT body has it on both cards', async () => {
    setupWithProgram([card('card1', 'ex3', 'Squat', 1, null)]);
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
    expect(
      body.exercises.map((e: any) => [e.id, e.exerciseId, e.supersetGroup, e.sets.length]),
    ).toEqual([
      ['card1', 'ex3', null, 1],
      [undefined, 'ex1', a.supersetGroup, 2],
      [undefined, 'ex2', a.supersetGroup, 1],
    ]);
  });

  it('loading a program whose cards share a supersetGroup renders one superset block with both members next to each other', () => {
    const sg = '11111111-1111-4111-8111-111111111111';
    setupWithProgram([
      card('card1', 'ex1', 'Bench Press', 1, sg),
      card('card2', 'ex3', 'Squat', 2, null),
      card('card3', 'ex2', 'Row', 3, sg),
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

  it('maps each loaded card 1:1 to an editor card with its id, exercise, superset and sets in order', () => {
    const sg = '12121212-1212-4121-8121-121212121212';
    setupWithProgram([
      card('card1', 'ex3', 'Squat', 1, null, [
        set('s1', 1, { reps: 3, weight: 140, notes: 'belt', made: true }),
        set('s2', 2, { reps: 2, weight: null, made: false }),
      ]),
      card('card2', 'ex1', 'Bench Press', 2, sg),
      card('card3', 'ex2', 'Row', 3, sg),
    ]);

    expect(component.exerciseGroups).toEqual([
      {
        id: 'card1',
        exerciseId: 'ex3',
        exerciseName: 'Squat',
        supersetGroup: null,
        sets: [
          { id: 's1', reps: 3, weight: 140, notes: 'belt', made: true },
          { id: 's2', reps: 2, weight: null, notes: '', made: false },
        ],
      },
      {
        id: 'card2',
        exerciseId: 'ex1',
        exerciseName: 'Bench Press',
        supersetGroup: sg,
        sets: [{ id: 'card2-s1', reps: 5, weight: 100, notes: '', made: null }],
      },
      {
        id: 'card3',
        exerciseId: 'ex2',
        exerciseName: 'Row',
        supersetGroup: sg,
        sets: [{ id: 'card3-s1', reps: 5, weight: 100, notes: '', made: null }],
      },
    ]);
  });

  it('removing 1 of 2 superset exercises clears the remaining card, and the next PUT sends supersetGroup null', () => {
    const sg = '22222222-2222-4222-8222-222222222222';
    setupWithProgram([
      card('card1', 'ex1', 'Bench Press', 1, sg),
      card('card2', 'ex2', 'Row', 2, sg),
    ]);

    component.removeExercise(0);
    fixture.detectChanges();

    expect(component.exerciseGroups[0].supersetGroup).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(0);
    const body = saveAndGetPut();
    expect(body.exercises).toEqual([
      jasmine.objectContaining({
        id: 'card2',
        exerciseId: 'ex2',
        order: 1,
        supersetGroup: null,
        sets: [jasmine.objectContaining({ id: 'card2-s1', order: 1 })],
      }),
    ]);
  });

  it('move arrows reorder inside a superset, and move a single card past a whole superset block', () => {
    const sg = '33333333-3333-4333-8333-333333333333';
    setupWithProgram([
      card('card1', 'ex1', 'Bench Press', 1, sg),
      card('card2', 'ex2', 'Row', 2, sg),
      card('card3', 'ex3', 'Squat', 3, null),
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

    const body = saveAndGetPut();
    expect(body.exercises.map((e: any) => [e.id, e.order])).toEqual([
      ['card3', 1],
      ['card2', 2],
      ['card1', 3],
    ]);
  });

  it('labels each remove-set button with its set number, and the last set cannot be removed', () => {
    setupWithProgram([
      card('card1', 'ex3', 'Squat', 1, null, [set('s1', 1), set('s2', 2, { reps: 3 })]),
    ]);

    const buttons = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll('.set-row ion-button[aria-label^="Remove set"]'),
      ) as any[];
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove set 1',
      'Remove set 2',
    ]);
    expect(buttons().every((b) => !b.disabled)).toBeTrue();

    component.removeSet(component.exerciseGroups[0], 0);
    fixture.detectChanges();
    expect(buttons().length).toBe(1);
    expect(buttons()[0].disabled).toBeTrue();

    const body = saveAndGetPut();
    expect(body.exercises[0].sets).toEqual([
      { id: 's2', reps: 3, weight: 100, notes: null, order: 1 },
    ]);
  });

  it('shows each loaded set\'s result in edit mode', () => {
    setupWithProgram([
      card('card1', 'ex3', 'Squat', 1, null, [
        set('s1', 1, { made: true }),
        set('s2', 2, { made: false }),
        set('s3', 3),
      ]),
    ]);

    const icons = Array.from(
      fixture.nativeElement.querySelectorAll('.set-row:not(.column-headers) .made-col ion-icon'),
    ).map((i: any) => i.getAttribute('name'));
    expect(icons).toEqual(['checkmark-circle', 'close-circle', 'remove-circle-outline']);
  });

  it('the PUT body keeps the loaded card and set ids, gives new rows no id and never sends made', () => {
    setupWithProgram([
      card('card1', 'ex3', 'Squat', 1, null, [
        set('s1', 1, { reps: 3, weight: 140, notes: 'belt', made: true }),
        set('s2', 2, { made: false }),
      ]),
      card('card2', 'ex1', 'Bench Press', 2, null),
    ]);
    const squat = component.exerciseGroups[0];
    squat.sets[1].reps = 4;
    component.addSet(squat);
    component.addExercises([{ id: 'ex2', name: 'Row' }]);

    const body = saveAndGetPut();

    expect(body).toEqual({
      name: 'Week 1',
      scheduledDate: '2026-10-05T00:00:00.000Z',
      exercises: [
        {
          id: 'card1',
          exerciseId: 'ex3',
          order: 1,
          supersetGroup: null,
          sets: [
            { id: 's1', reps: 3, weight: 140, notes: 'belt', order: 1 },
            { id: 's2', reps: 4, weight: 100, notes: null, order: 2 },
            { reps: 4, weight: 100, notes: null, order: 3 },
          ],
        },
        {
          id: 'card2',
          exerciseId: 'ex1',
          order: 2,
          supersetGroup: null,
          sets: [{ id: 'card2-s1', reps: 5, weight: 100, notes: null, order: 1 }],
        },
        {
          exerciseId: 'ex2',
          order: 3,
          supersetGroup: null,
          sets: [{ reps: 5, weight: null, notes: null, order: 1 }],
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('made');
  });

  it('sends decimal reps entries as whole numbers', () => {
    setupWithProgram([
      card('card1', 'ex3', 'Squat', 1, null, [set('s1', 1), set('s2', 2)]),
    ]);
    const [first, second] = component.exerciseGroups[0].sets;
    first.reps = 8.5;
    second.reps = '7.4' as any;
    second.weight = 102.5;

    const body = saveAndGetPut();

    expect(body.exercises).toEqual([
      {
        id: 'card1',
        exerciseId: 'ex3',
        order: 1,
        supersetGroup: null,
        sets: [
          { id: 's1', reps: 9, weight: 100, notes: null, order: 1 },
          { id: 's2', reps: 7, weight: 102.5, notes: null, order: 2 },
        ],
      },
    ]);
  });

  it('adjacent standalone cards with the same exercise survive save and reopen as 2 cards', async () => {
    setupWithProgram([card('card1', 'ex3', 'Squat', 1, null)]);
    pickerReturns({ exercises: [{ id: 'ex3', name: 'Squat' }], superset: false }, 'confirm');

    await component.openExercisePicker();
    component.exerciseGroups[1].sets[0].reps = 8;

    let response: any;
    const body = saveAndGetPut((b) => (response = apiResponse(b)));
    expect(body.exercises.map((e: any) => [e.id, e.exerciseId, e.supersetGroup])).toEqual([
      ['card1', 'ex3', null],
      [undefined, 'ex3', null],
    ]);

    reopen(response.exercises);

    expect(
      component.exerciseGroups.map((g) => [g.id, g.exerciseId, g.sets.map((s) => s.reps)]),
    ).toEqual([
      ['card1', 'ex3', [5]],
      ['new-card-1', 'ex3', [8]],
    ]);
    expect(fixture.nativeElement.querySelectorAll('ion-card.exercise-card').length).toBe(2);
  });

  it('adjacent cards with the same exercise inside one superset survive save and reopen as 2 cards in 1 superset', () => {
    const sg = '66666666-6666-4666-8666-666666666666';
    setupWithProgram([
      card('card1', 'ex1', 'Bench Press', 1, sg, [set('s1', 1, { reps: 5 })]),
      card('card2', 'ex1', 'Bench Press', 2, sg, [set('s2', 1, { reps: 3 })]),
    ]);

    expect(component.exerciseGroups.length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.superset-card .exercise-title').length).toBe(2);

    let response: any;
    const body = saveAndGetPut((b) => (response = apiResponse(b)));
    expect(
      body.exercises.map((e: any) => [e.id, e.exerciseId, e.supersetGroup, e.sets.map((s: any) => s.id)]),
    ).toEqual([
      ['card1', 'ex1', sg, ['s1']],
      ['card2', 'ex1', sg, ['s2']],
    ]);

    reopen(response.exercises);

    expect(
      component.exerciseGroups.map((g) => [g.id, g.supersetGroup, g.sets.map((s) => s.reps)]),
    ).toEqual([
      ['card1', sg, [5]],
      ['card2', sg, [3]],
    ]);
    expect(fixture.nativeElement.querySelectorAll('.superset-card').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.superset-card .exercise-title').length).toBe(2);
  });

  describe('superset card', () => {
    const sg = '44444444-4444-4444-8444-444444444444';

    // Squat (standalone), then a superset of Bench Press (2 sets) and Row
    function loadSuperset() {
      setupWithProgram([
        card('card1', 'ex3', 'Squat', 1, null, [set('s1', 1)]),
        card('card2', 'ex1', 'Bench Press', 2, sg, [
          set('s2', 1, { made: true }),
          set('s4', 2, { reps: 4, notes: 'slow' }),
        ]),
        card('card3', 'ex2', 'Row', 3, sg, [set('s3', 1, { reps: 8, weight: 60, made: false })]),
      ]);
    }

    function stubAlert(role: string) {
      const alert = jasmine.createSpyObj<HTMLIonAlertElement>(
        'HTMLIonAlertElement',
        ['present', 'onDidDismiss'],
      );
      alert.present.and.resolveTo();
      alert.onDidDismiss.and.resolveTo({ role } as any);
      alertCtrlSpy.create.and.resolveTo(alert);
      return alertCtrlSpy.create;
    }

    function el(selector: string): HTMLElement {
      return fixture.nativeElement.querySelector(selector);
    }

    it('draws a superset of 2 as exactly 1 ion-card holding both members', () => {
      setupWithProgram([
        card('card1', 'ex1', 'Bench Press', 1, sg),
        card('card2', 'ex2', 'Row', 2, sg),
      ]);

      const cards = fixture.nativeElement.querySelectorAll('ion-card');
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute('role')).toBe('group');
      expect(cards[0].getAttribute('aria-label')).toBe('Superset');
      expect(cards[0].textContent).toContain('SUPERSET');
      expect(cards[0].textContent).toContain('Bench Press');
      expect(cards[0].textContent).toContain('Row');
      expect(cards[0].querySelectorAll('ion-card').length).toBe(0);
      // Header + 1 set row per member, and 1 Add Set per member
      expect(cards[0].querySelectorAll('.set-row:not(.column-headers)').length).toBe(2);
      expect(cards[0].querySelectorAll('.add-set-btn').length).toBe(2);
    });

    // ion-card drops a host aria-label once it loads, so the name must come
    // from aria-labelledby pointing at the SUPERSET label inside the group
    function expectNamedSuperset(group: HTMLElement, memberNames: string[]) {
      const labelId = group.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const label = document.getElementById(labelId!);
      expect(label).toBeTruthy();
      expect(label!.textContent!.trim().toLowerCase()).toBe('superset');
      expect(group.contains(label)).toBeTrue();
      const titles = Array.from(group.querySelectorAll('.exercise-title')).map(
        (t) => t.textContent!.trim(),
      );
      expect(titles).toEqual(memberNames);
    }

    it('each superset group is named by its own SUPERSET label, which contains both members', () => {
      const sg2 = '55555555-5555-4555-8555-555555555555';
      setupWithProgram([
        card('card1', 'ex1', 'Bench Press', 1, sg),
        card('card2', 'ex2', 'Row', 2, sg),
        card('card3', 'ex3', 'Curl', 3, sg2),
        card('card4', 'ex4', 'Dip', 4, sg2),
      ]);

      const groups = Array.from(
        fixture.nativeElement.querySelectorAll('[role="group"]'),
      ) as HTMLElement[];
      expect(groups.length).toBe(2);
      expect(groups[0].getAttribute('aria-labelledby')).not.toBe(
        groups[1].getAttribute('aria-labelledby'),
      );
      expectNamedSuperset(groups[0], ['Bench Press', 'Row']);
      expectNamedSuperset(groups[1], ['Curl', 'Dip']);
    });

    it('the Delete superset button is full size; member Replace and delete buttons are small; only the header has arrows', () => {
      loadSuperset();

      const deleteSuperset = el('ion-button[aria-label="Delete superset"]');
      expect(deleteSuperset).toBeTruthy();
      expect(deleteSuperset.getAttribute('size')).not.toBe('small');
      for (const name of ['Bench Press', 'Row']) {
        expect(el(`ion-button[aria-label="Remove ${name}"]`).getAttribute('size')).toBe('small');
        expect(el(`ion-button[aria-label="Replace ${name}"]`).getAttribute('size')).toBe('small');
        expect(el(`ion-button[aria-label="Move ${name} up"]`)).toBeNull();
      }
      const supersetCard = el('.superset-card');
      expect(supersetCard.querySelectorAll('ion-icon[name="arrow-up-outline"]').length).toBe(1);
      expect(supersetCard.querySelectorAll('ion-icon[name="arrow-down-outline"]').length).toBe(1);
      // Standalone cards keep their arrows and get the same small Replace button
      expect(el('ion-button[aria-label="Replace Squat"]').getAttribute('size')).toBe('small');
      expect(el('ion-button[aria-label="Move Squat down"]')).toBeTruthy();
    });

    it('the superset header arrows move the whole superset past a standalone card and are disabled at the ends', () => {
      loadSuperset();
      const ids = () => component.exerciseGroups.map((g) => g.exerciseId);
      const up = () => el('ion-button[aria-label="Move superset up"]');
      const down = () => el('ion-button[aria-label="Move superset down"]');

      expect((up() as any).disabled).toBeFalse();
      expect((down() as any).disabled).toBeTrue();

      up().click();
      fixture.detectChanges();
      expect(ids()).toEqual(['ex1', 'ex2', 'ex3']);
      expect((up() as any).disabled).toBeTrue();
      expect((down() as any).disabled).toBeFalse();

      down().click();
      fixture.detectChanges();
      expect(ids()).toEqual(['ex3', 'ex1', 'ex2']);

      up().click();
      fixture.detectChanges();
      const body = saveAndGetPut();
      expect(
        body.exercises.map((e: any) => [e.id, e.exerciseId, e.supersetGroup, e.order]),
      ).toEqual([
        ['card2', 'ex1', sg, 1],
        ['card3', 'ex2', sg, 2],
        ['card1', 'ex3', null, 3],
      ]);
      expect(body.exercises[0].sets.map((s: any) => [s.id, s.order])).toEqual([
        ['s2', 1],
        ['s4', 2],
      ]);
    });

    it('confirming Delete superset removes both members, and the next PUT has neither', async () => {
      loadSuperset();
      const createSpy = stubAlert('destructive');

      el('ion-button[aria-label="Delete superset"]').click();
      await fixture.whenStable();

      expect(createSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          header: 'Delete superset?',
          message: 'Removes 2 exercises and their sets',
        }),
      );
      expect(component.exerciseGroups.map((g) => g.exerciseId)).toEqual(['ex3']);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.superset-card').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('ion-card').length).toBe(1);

      const body = saveAndGetPut();
      expect(body.exercises.map((e: any) => [e.id, e.exerciseId])).toEqual([['card1', 'ex3']]);
    });

    it('cancelling Delete superset changes nothing', async () => {
      loadSuperset();
      stubAlert('cancel');

      await component.removeSuperset(sg);

      expect(component.exerciseGroups.map((g) => g.exerciseId)).toEqual(['ex3', 'ex1', 'ex2']);
      const body = saveAndGetPut();
      expect(body.exercises.map((e: any) => [e.id, e.exerciseId, e.sets.length])).toEqual([
        ['card1', 'ex3', 1],
        ['card2', 'ex1', 2],
        ['card3', 'ex2', 1],
      ]);
      expect(body.exercises.slice(1).every((e: any) => e.supersetGroup === sg)).toBeTrue();
    });

    it('deleting one member (no confirm) leaves the other standalone, saved with supersetGroup null', () => {
      loadSuperset();

      el('ion-button[aria-label="Remove Bench Press"]').click();
      fixture.detectChanges();

      expect(alertCtrlSpy.create).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelectorAll('.superset-card').length).toBe(0);
      const titles = Array.from(
        fixture.nativeElement.querySelectorAll('ion-card.exercise-card .exercise-title'),
      ).map((t: any) => t.textContent.trim());
      expect(titles).toEqual(['Squat', 'Row']);

      const body = saveAndGetPut();
      expect(body.exercises.map((e: any) => [e.id, e.exerciseId, e.supersetGroup])).toEqual([
        ['card1', 'ex3', null],
        ['card3', 'ex2', null],
      ]);
    });

    it('Replace swaps the exercise in place, keeping order, supersetGroup, every set and the card and set ids', async () => {
      loadSuperset();
      pickerReturns({ exercises: [{ id: 'ex9', name: 'Incline Press' }], superset: false }, 'confirm');

      el('ion-button[aria-label="Replace Bench Press"]').click();
      await fixture.whenStable();

      const props = modalCtrlSpy.create.calls.mostRecent().args[0]!.componentProps as any;
      expect(props.mode).toBe('replace');
      expect(props.excludeIds).toBeUndefined();

      expect(component.exerciseGroups.map((g) => g.exerciseId)).toEqual(['ex3', 'ex9', 'ex2']);
      const replaced = component.exerciseGroups[1];
      expect(replaced.id).toBe('card2');
      expect(replaced.exerciseName).toBe('Incline Press');
      expect(replaced.supersetGroup).toBe(sg);
      expect(replaced.sets.map((s) => s.made)).toEqual([true, null]);
      expect(component.exercisesList.some((e) => e.id === 'ex9')).toBeTrue();

      fixture.detectChanges();
      const titles = Array.from(
        fixture.nativeElement.querySelectorAll('.superset-card .exercise-title'),
      ).map((t: any) => t.textContent.trim());
      expect(titles).toEqual(['Incline Press', 'Row']);

      const body = saveAndGetPut();
      expect(body.exercises).toEqual([
        jasmine.objectContaining({ id: 'card1', exerciseId: 'ex3', order: 1, supersetGroup: null }),
        {
          id: 'card2',
          exerciseId: 'ex9',
          order: 2,
          supersetGroup: sg,
          sets: [
            { id: 's2', reps: 5, weight: 100, notes: null, order: 1 },
            { id: 's4', reps: 4, weight: 100, notes: 'slow', order: 2 },
          ],
        },
        {
          id: 'card3',
          exerciseId: 'ex2',
          order: 3,
          supersetGroup: sg,
          sets: [{ id: 's3', reps: 8, weight: 60, notes: null, order: 1 }],
        },
      ]);
    });

    it('the standalone card delete button is labelled with the exercise name', () => {
      loadSuperset();

      const remove = el('ion-card.exercise-card ion-button[aria-label="Remove Squat"]');
      expect(remove).toBeTruthy();
      expect(remove.getAttribute('size')).toBe('small');
    });

    it('Replace on a standalone card swaps the exercise in place, keeping its set and supersetGroup null', async () => {
      setupWithProgram([
        card('card1', 'ex3', 'Squat', 1, null, [set('s1', 1, { reps: 3, weight: 140, notes: 'belt' })]),
        card('card2', 'ex1', 'Bench Press', 2, sg),
        card('card3', 'ex2', 'Row', 3, sg),
      ]);
      pickerReturns({ exercises: [{ id: 'ex9', name: 'Front Squat' }], superset: false }, 'confirm');

      el('ion-card.exercise-card ion-button[aria-label="Replace Squat"]').click();
      await fixture.whenStable();

      expect(component.exerciseGroups.map((g) => g.exerciseId)).toEqual(['ex9', 'ex1', 'ex2']);
      expect(component.exerciseGroups[0].exerciseName).toBe('Front Squat');
      expect(component.exerciseGroups[0].supersetGroup).toBeNull();

      fixture.detectChanges();
      expect(el('ion-card.exercise-card .exercise-title').textContent!.trim()).toBe('Front Squat');

      const body = saveAndGetPut();
      expect(body.exercises).toEqual([
        {
          id: 'card1',
          exerciseId: 'ex9',
          order: 1,
          supersetGroup: null,
          sets: [{ id: 's1', reps: 3, weight: 140, notes: 'belt', order: 1 }],
        },
        jasmine.objectContaining({ id: 'card2', exerciseId: 'ex1', order: 2, supersetGroup: sg }),
        jasmine.objectContaining({ id: 'card3', exerciseId: 'ex2', order: 3, supersetGroup: sg }),
      ]);
    });

    it('dismissing the replace picker with nothing changes nothing', async () => {
      loadSuperset();
      pickerReturns(null, 'cancel');

      await component.replaceExercise(component.exerciseGroups[1]);

      expect(component.exerciseGroups.map((g) => g.exerciseId)).toEqual(['ex3', 'ex1', 'ex2']);
      expect(component.exerciseGroups[1].exerciseName).toBe('Bench Press');
      expect(component.exerciseGroups[1].sets.length).toBe(2);
    });

    it('replace mode lists all exercises: the picker gets the full list and no excludeIds', async () => {
      loadSuperset();
      pickerReturns(null, 'cancel');

      await component.replaceExercise(component.exerciseGroups[1]);

      const props = modalCtrlSpy.create.calls.mostRecent().args[0]!.componentProps as any;
      expect(props.mode).toBe('replace');
      expect(props.exercises).toBe(component.exercisesList);
      expect(props.exercises.map((e: any) => e.id)).toEqual(['ex1', 'ex2', 'ex3']);
      expect(props.excludeIds).toBeUndefined();
    });

    it('replacing a card with an exercise already on another card shows it on both, saves it in place and reopens as separate cards', async () => {
      loadSuperset();
      pickerReturns({ exercises: [{ id: 'ex3', name: 'Squat' }], superset: false }, 'confirm');

      el('ion-button[aria-label="Replace Bench Press"]').click();
      await fixture.whenStable();

      expect(component.exerciseGroups.map((g) => [g.exerciseId, g.supersetGroup])).toEqual([
        ['ex3', null],
        ['ex3', sg],
        ['ex2', sg],
      ]);
      fixture.detectChanges();
      const titles = Array.from(fixture.nativeElement.querySelectorAll('.exercise-title')).map(
        (t: any) => t.textContent.trim(),
      );
      expect(titles).toEqual(['Squat', 'Squat', 'Row']);

      let response: any;
      const body = saveAndGetPut((b) => (response = apiResponse(b)));
      expect(body.exercises).toEqual([
        jasmine.objectContaining({ id: 'card1', exerciseId: 'ex3', order: 1, supersetGroup: null }),
        jasmine.objectContaining({
          id: 'card2',
          exerciseId: 'ex3',
          order: 2,
          supersetGroup: sg,
          sets: [
            { id: 's2', reps: 5, weight: 100, notes: null, order: 1 },
            { id: 's4', reps: 4, weight: 100, notes: 'slow', order: 2 },
          ],
        }),
        jasmine.objectContaining({ id: 'card3', exerciseId: 'ex2', order: 3, supersetGroup: sg }),
      ]);

      reopen(response.exercises);

      expect(
        component.exerciseGroups.map((g) => [g.id, g.exerciseId, g.supersetGroup, g.sets.map((s) => s.id)]),
      ).toEqual([
        ['card1', 'ex3', null, ['s1']],
        ['card2', 'ex3', sg, ['s2', 's4']],
        ['card3', 'ex2', sg, ['s3']],
      ]);
      expect(fixture.nativeElement.querySelectorAll('.exercise-title').length).toBe(3);
      expect(
        fixture.nativeElement.querySelectorAll('.superset-card .exercise-title').length,
      ).toBe(2);
    });
  });
});
