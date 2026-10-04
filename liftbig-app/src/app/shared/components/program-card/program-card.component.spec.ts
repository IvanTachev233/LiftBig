import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProgramCardComponent } from './program-card.component';
import { Program, ProgramCard, ProgramSet } from '../../../core/program.service';

describe('ProgramCardComponent', () => {
  let fixture: ComponentFixture<ProgramCardComponent>;

  const set = (order: number, reps: number, weight: number | null): ProgramSet => ({
    id: `set-${Math.random()}`,
    reps,
    weight,
    notes: null,
    order,
    made: null,
  });

  const card = (
    id: string,
    order: number,
    exerciseId: string,
    name: string,
    sets: ProgramSet[],
  ): ProgramCard => ({
    id,
    exerciseId,
    exercise: { id: exerciseId, name },
    order,
    supersetGroup: null,
    sets,
  });

  const program = (exercises: ProgramCard[]): Program => ({
    id: 'program-1',
    clientId: 'client-1',
    coachId: 'coach-1',
    name: 'Day 1',
    scheduledDate: '2026-09-28',
    createdAt: '',
    updatedAt: '',
    exercises,
  });

  const render = (p: Program) => {
    fixture = TestBed.createComponent(ProgramCardComponent);
    fixture.componentInstance.program = p;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return {
      badge: el.querySelector('ion-badge')?.textContent?.trim(),
      // Name and sets summary are separate spans
      rows: Array.from(el.querySelectorAll('.exercise-preview')).map((r) =>
        Array.from(r.children)
          .map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
          .join(' '),
      ),
      more: el.querySelector('.more-exercises')?.textContent?.trim() ?? null,
    };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProgramCardComponent],
      providers: [provideRouter([])],
    });
  });

  it('summarizes each card with its set count, reps and weight, keeping duplicate exercises separate', () => {
    const view = render(
      program([
        card('card-1', 1, 'squat', 'Squat', [set(1, 5, 100), set(2, 5, 100), set(3, 5, 100)]),
        card('card-2', 2, 'squat', 'Squat', [set(1, 8, 80)]),
        card('card-3', 3, 'plank', 'Plank', [set(1, 1, null), set(2, 1, null)]),
      ]),
    );

    expect(view.badge).toBe('3 exercises');
    expect(view.rows).toEqual(['Squat 3x5 @ 100kg', 'Squat 1x8 @ 80kg', 'Plank 2x1']);
    expect(view.more).toBeNull();
  });

  it('shows the first three cards and counts the rest as more', () => {
    const view = render(
      program(
        ['a', 'b', 'c', 'd', 'e'].map((n, i) =>
          card(`card-${n}`, i + 1, n, n.toUpperCase(), [set(1, 5, 50)]),
        ),
      ),
    );

    expect(view.badge).toBe('5 exercises');
    expect(view.rows).toEqual(['A 1x5 @ 50kg', 'B 1x5 @ 50kg', 'C 1x5 @ 50kg']);
    expect(view.more).toBe('+2 more');
  });

  it('handles a program without cards', () => {
    const view = render(program([]));

    expect(view.badge).toBe('0 exercises');
    expect(view.rows).toEqual([]);
  });
});
