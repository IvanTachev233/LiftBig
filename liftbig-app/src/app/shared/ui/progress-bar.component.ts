import { Component, computed, input } from '@angular/core';

/** 4px progress bar, or one segment per step (program sessions) when segmented */
@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.component.html',
  styleUrls: ['./progress-bar.component.scss'],
  standalone: true,
})
export class ProgressBarComponent {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  /** Accessible name, e.g. "Sets logged" */
  readonly label = input.required<string>();
  readonly segmented = input(false);

  protected readonly percent = computed(() =>
    this.max() > 0 ? Math.min(100, Math.max(0, (this.value() / this.max()) * 100)) : 0,
  );
  protected readonly complete = computed(() => this.max() > 0 && this.value() >= this.max());
  protected readonly steps = computed(() => Array.from({ length: Math.max(0, this.max()) }, (_, i) => i));
}
