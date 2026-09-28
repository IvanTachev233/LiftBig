import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ProgramLoggerPage } from './program-logger.page';
import { Program, ProgramService } from '../../core/program.service';

describe('ProgramLoggerPage', () => {
  let fixture: ComponentFixture<ProgramLoggerPage>;

  const set = (id: string, order: number, made: boolean | null) => ({
    id,
    exerciseId: 'squat',
    exercise: { id: 'squat', name: 'Squat', bodyPart: 'LG' },
    reps: 5,
    weight: 100,
    notes: null,
    order,
    made,
  });

  const program: Program = {
    id: 'program-1',
    clientId: 'client-1',
    coachId: 'coach-1',
    name: 'Day 1',
    scheduledDate: '2026-09-28',
    createdAt: '',
    updatedAt: '',
    exercises: [set('s1', 1, true), set('s2', 2, false), set('s3', 3, null)],
  };

  const madeButtons = () =>
    Array.from(
      fixture.nativeElement.querySelectorAll('ion-button.made-col'),
    ) as HTMLElement[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProgramLoggerPage],
      providers: [
        {
          provide: ProgramService,
          useValue: { getProgram: () => of(structuredClone(program)) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'program-1' }) },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ProgramLoggerPage);
    fixture.detectChanges();
  });

  it('renders made, missed and unset sets with distinct icon, color and label', () => {
    // Angular binds name/color as element properties on Ionic components
    const rendered = madeButtons().map((b) => [
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
    const page = fixture.componentInstance;
    const unset = page.exerciseGroups[0].sets[2];

    const seen = [0, 1, 2].map(() => {
      madeButtons()[2].click();
      fixture.detectChanges();
      return unset.made;
    });

    expect(seen).toEqual([true, false, null]);
    expect(unset.dirty).toBeTrue();
  });
});
