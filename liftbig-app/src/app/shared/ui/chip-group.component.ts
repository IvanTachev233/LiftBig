import { Component, ElementRef, computed, input, model, viewChildren } from '@angular/core';

export interface ChipOption {
  value: string;
  label: string;
}

const NEXT: Record<string, (i: number, last: number) => number> = {
  ArrowRight: (i, last) => (i === last ? 0 : i + 1),
  ArrowDown: (i, last) => (i === last ? 0 : i + 1),
  ArrowLeft: (i, last) => (i === 0 ? last : i - 1),
  ArrowUp: (i, last) => (i === 0 ? last : i - 1),
  Home: () => 0,
  End: (_, last) => last,
};

/** Single-select filter chips with radio group semantics and arrow-key selection */
@Component({
  selector: 'app-chip-group',
  templateUrl: './chip-group.component.html',
  standalone: true,
})
export class ChipGroupComponent {
  readonly options = input.required<ChipOption[]>();
  /** Accessible name of the group */
  readonly label = input.required<string>();
  readonly value = model<string | null>(null);

  private readonly chips = viewChildren<ElementRef<HTMLButtonElement>>('chip');

  // The selected chip is the tab stop; with none selected, the first one
  protected readonly tabStop = computed(() =>
    Math.max(
      0,
      this.options().findIndex((o) => o.value === this.value()),
    ),
  );

  protected select(option: ChipOption) {
    this.value.set(option.value);
  }

  protected onKeydown(event: KeyboardEvent, index: number) {
    const next = NEXT[event.key];
    if (!next) return;
    event.preventDefault();
    const target = next(index, this.options().length - 1);
    this.value.set(this.options()[target].value);
    this.chips()[target]?.nativeElement.focus();
  }
}
