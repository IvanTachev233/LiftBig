import { Component, computed, input } from '@angular/core';

export type StatusPillKind =
  | 'today'
  | 'planned'
  | 'done'
  | 'missed'
  | 'in-progress'
  | 'pr'
  | 'coach'
  | 'program';

const LABELS: Record<StatusPillKind, string> = {
  today: 'Today',
  planned: 'Planned',
  done: 'Done',
  missed: 'Missed',
  'in-progress': 'In progress',
  pr: 'PR',
  coach: 'Coach',
  program: 'Program',
};

// Workout status or tag; workoutStatusLabel() gives the kind and words
@Component({
  selector: 'app-status-pill',
  template: '{{ text() }}',
  styleUrls: ['./status-pill.component.scss'],
  standalone: true,
  host: { '[class]': 'classes()' },
})
export class StatusPillComponent {
  readonly kind = input.required<StatusPillKind>();
  /** Replaces the kind's default word, e.g. "Not started" */
  readonly label = input<string>();
  /** sm: the tag size used beside a list row title */
  readonly size = input<'md' | 'sm'>('md');

  protected readonly text = computed(() => this.label() ?? LABELS[this.kind()]);
  protected readonly classes = computed(
    () => `pill-${this.kind()}${this.size() === 'sm' ? ' pill-sm' : ''}`,
  );
}
