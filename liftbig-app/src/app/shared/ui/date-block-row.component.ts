import { Component, computed, input } from '@angular/core';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * List row with a date block: weekday over day number, title (with [tags]
 * beside it), sub line and a [trailing] slot. Wrap it in a link or button to
 * make it tappable.
 */
@Component({
  selector: 'app-date-block-row',
  templateUrl: './date-block-row.component.html',
  styleUrls: ['./date-block-row.component.scss'],
  standalone: true,
})
export class DateBlockRowComponent {
  /** A workout date (timestamp) or YYYY-MM-DD; its calendar day is the date part */
  readonly date = input.required<string>();
  readonly title = input.required<string>();
  readonly sub = input<string | null>();
  /** accent: an open state such as "In progress"; muted: e.g. "Missed" */
  readonly subTone = input<'default' | 'accent' | 'muted'>('default');

  protected readonly day = computed(() => this.date().slice(0, 10));
  protected readonly weekday = computed(() => {
    const [y, m, d] = this.day().split('-').map(Number);
    return WEEKDAYS[new Date(y, m - 1, d).getDay()];
  });
  protected readonly dayOfMonth = computed(() => Number(this.day().slice(8, 10)));
}
