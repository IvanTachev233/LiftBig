import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Workout } from '../../../core/workout.service';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { WorkoutCardComponent } from './workout-card.component';

describe('WorkoutCardComponent', () => {
  let fixture: ComponentFixture<WorkoutCardComponent>;

  const workout = (overrides: Partial<Workout> = {}): Workout => ({
    id: 'w1',
    name: 'Day 1',
    date: '2030-01-01T00:00:00.000Z',
    status: 'PLANNED',
    totalWeightLifted: 1000,
    assignedById: null,
    assignedBy: null,
    exercises: [],
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkoutCardComponent],
      providers: [provideRouter([])],
    });
  });

  function render(w: Workout) {
    fixture = TestBed.createComponent(WorkoutCardComponent);
    fixture.componentInstance.workout = w;
    fixture.detectChanges();
  }

  const volume = () =>
    (
      fixture.nativeElement.querySelector('.card-volume-row .font-mono') as HTMLElement
    ).textContent!.trim();

  it('shows the volume in kg for kg users', () => {
    render(workout());
    expect(volume()).toBe('1000 kg');
  });

  it("shows the volume in the user's unit", () => {
    TestBed.inject(WeightUnitService).setUnit('lb');
    render(workout());
    expect(volume()).toBe('2204.6 lb');
  });

  const badge = () =>
    (fixture.nativeElement.querySelector('.source-badge') as HTMLElement | null)
      ?.textContent!.trim() ?? null;

  it('shows no badge on a self-made workout', () => {
    render(workout({ source: 'manual' }));
    expect(badge()).toBeNull();
  });

  it('shows a coach badge on an assigned workout', () => {
    render(
      workout({
        source: 'coach',
        assignedById: 'c1',
        assignedBy: { id: 'c1', name: 'Kim' },
      }),
    );
    expect(badge()).toBe('Coach · Kim');
  });

  it('shows a program badge on a program workout', () => {
    render(
      workout({
        source: 'program',
        program: { enrollmentId: 'en1', name: 'Sample Powerlifting Program' },
      }),
    );
    expect(badge()).toBe('Program · Sample Powerlifting Program');
  });
});
