import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { ProgramLoggerPage } from './program-logger.page';
import { Program, ProgramCard, ProgramSet } from '../../core/program.service';
import { environment } from '../../../environments/environment';

describe('ProgramLoggerPage', () => {
  let fixture: ComponentFixture<ProgramLoggerPage>;
  let page: ProgramLoggerPage;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/programs`;

  const set = (id: string, order: number, made: boolean | null): ProgramSet => ({
    id,
    reps: 5,
    weight: 100,
    notes: null,
    order,
    made,
  });

  const card = (
    id: string,
    order: number,
    exerciseId: string,
    name: string,
    sets: ProgramSet[],
    supersetGroup: string | null = null,
  ): ProgramCard => ({
    id,
    exerciseId,
    exercise: { id: exerciseId, name },
    order,
    supersetGroup,
    sets,
  });

  const program: Program = {
    id: 'program-1',
    clientId: 'client-1',
    coachId: 'coach-1',
    name: 'Day 1',
    scheduledDate: '2026-09-28',
    createdAt: '',
    updatedAt: '',
    exercises: [
      card('card-1', 1, 'squat', 'Squat', [
        set('s1', 1, true),
        set('s2', 2, false),
        set('s3', 3, null),
      ]),
      // Same exercise again on its own card
      card('card-2', 2, 'squat', 'Squat', [set('s4', 1, null)]),
      card('card-3', 3, 'bench', 'Bench', [set('s5', 1, null)], 'ss-1'),
      card('card-4', 4, 'row', 'Row', [set('s6', 1, null)], 'ss-1'),
    ],
  };

  const madeButtons = (root: ParentNode = fixture.nativeElement) =>
    Array.from(root.querySelectorAll('ion-button.made-col')) as HTMLElement[];

  const cardTitles = (root: ParentNode = fixture.nativeElement) =>
    Array.from(root.querySelectorAll('.exercise-title')).map((el) =>
      el.textContent?.trim(),
    );

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProgramLoggerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ToastController,
          useValue: {
            create: () => Promise.resolve({ present: () => Promise.resolve() }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'program-1' }) },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProgramLoggerPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    httpMock
      .expectOne({ method: 'GET', url: `${base}/program-1` })
      .flush(structuredClone(program));
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders made, missed and unset sets with distinct icon, color and label', () => {
    // Angular binds name/color as element properties on Ionic components
    const rendered = madeButtons()
      .slice(0, 3)
      .map((b) => [
        (b.querySelector('ion-icon') as HTMLIonIconElement).name,
        (b as HTMLIonButtonElement).color,
        b.getAttribute('aria-label'),
      ]);

    expect(rendered).toEqual([
      ['checkmark-circle', 'success', 'Made. Tap to mark as missed'],
      ['close-circle', 'danger', 'Missed. Tap to clear result'],
      ['remove-circle-outline', 'medium', 'No result. Tap to mark as made'],
    ]);
  });

  it('cycles unset -> made -> missed -> unset and marks the set dirty', () => {
    const unset = page.exerciseGroups[0].sets[2];

    const seen = [0, 1, 2].map(() => {
      madeButtons()[2].click();
      fixture.detectChanges();
      return unset.made;
    });

    expect(seen).toEqual([true, false, null]);
    expect(unset.dirty).toBeTrue();
  });

  it('renders one block per card in card order, keeping duplicate exercises separate', () => {
    expect(cardTitles()).toEqual(['Squat', 'Squat', 'Bench', 'Row']);
    expect(page.exerciseGroups.map((g) => g.cardId)).toEqual([
      'card-1',
      'card-2',
      'card-3',
      'card-4',
    ]);
    expect(page.exerciseGroups[0].sets.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(page.exerciseGroups[1].sets.map((s) => s.id)).toEqual(['s4']);
  });

  it('sorts cards and sets by order', () => {
    const shuffled = structuredClone(program);
    shuffled.exercises.reverse();
    shuffled.exercises[3].sets.reverse();

    fixture = TestBed.createComponent(ProgramLoggerPage);
    fixture.detectChanges();
    httpMock
      .expectOne({ method: 'GET', url: `${base}/program-1` })
      .flush(shuffled);
    fixture.detectChanges();

    const groups = fixture.componentInstance.exerciseGroups;
    expect(groups.map((g) => g.cardId)).toEqual(['card-1', 'card-2', 'card-3', 'card-4']);
    expect(groups[0].sets.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('groups cards sharing a supersetGroup under one SUPERSET block', () => {
    const blocks = Array.from(
      fixture.nativeElement.querySelectorAll('.superset-card'),
    ) as HTMLElement[];

    expect(blocks.length).toBe(1);
    expect(blocks[0].querySelector('.superset-label')?.textContent?.trim()).toBe(
      'SUPERSET',
    );
    expect(cardTitles(blocks[0])).toEqual(['Bench', 'Row']);
  });

  it('posts a new set to its card and keeps the id from the response', () => {
    // The second Squat card, so the request must target its own card id
    const group = page.exerciseGroups[1];
    page.addSet(group);
    const added = group.sets[1];
    added.made = true;

    page.saveAll();

    const req = httpMock.expectOne({
      method: 'POST',
      url: `${base}/program-1/exercises/card-2/sets`,
    });
    expect(req.request.body).toEqual({ reps: 5, weight: 100, notes: null, made: true });
    req.flush({ ...set('s7', 2, true), programExerciseId: 'card-2' });

    expect(added.id).toBe('s7');
    expect(added.isNew).toBeFalse();
    expect(added.dirty).toBeFalse();
  });

  it('patches an existing set by its id when a result or value changes', () => {
    madeButtons()[3].click(); // first set of the second Squat card
    fixture.detectChanges();
    const edited = page.exerciseGroups[0].sets[0];
    edited.reps = 3;
    edited.notes = 'heavy';
    page.markDirty(edited);

    page.saveAll();

    const marked = httpMock.expectOne({ method: 'PATCH', url: `${base}/program-1/sets/s4` });
    expect(marked.request.body).toEqual({ reps: 5, weight: 100, notes: null, made: true });
    const changed = httpMock.expectOne({ method: 'PATCH', url: `${base}/program-1/sets/s1` });
    expect(changed.request.body).toEqual({ reps: 3, weight: 100, notes: 'heavy', made: true });
    marked.flush(set('s4', 1, true));
    changed.flush({ ...set('s1', 1, true), reps: 3, notes: 'heavy' });

    expect(page.exerciseGroups[1].sets[0].dirty).toBeFalse();
    expect(edited.dirty).toBeFalse();
  });

  it('sends decimal reps entries as whole numbers when adding and updating sets', () => {
    const edited = page.exerciseGroups[0].sets[0];
    edited.reps = 8.5;
    edited.weight = 102.5;
    page.markDirty(edited);
    const group = page.exerciseGroups[1];
    page.addSet(group);
    group.sets[1].reps = '7.4' as any;

    page.saveAll();

    const updated = httpMock.expectOne({ method: 'PATCH', url: `${base}/program-1/sets/s1` });
    expect(updated.request.body).toEqual({ reps: 9, weight: 102.5, notes: null, made: true });
    const added = httpMock.expectOne({
      method: 'POST',
      url: `${base}/program-1/exercises/card-2/sets`,
    });
    expect(added.request.body).toEqual({ reps: 7, weight: 100, notes: null, made: null });
    updated.flush({ ...set('s1', 1, true), reps: 9, weight: 102.5 });
    added.flush({ ...set('s7', 2, null), reps: 7, programExerciseId: 'card-2' });
  });

  it('sends nothing when no set changed', () => {
    page.saveAll();
    expect(httpMock.match(() => true)).toEqual([]);
  });
});
