import { Component, input } from '@angular/core';

export interface StripDay {
  // YYYY-MM-DD
  date: string;
  // One letter, M to S
  weekday: string;
  day: number;
  today: boolean;
  // done: a completed workout; open: in progress or planned and past;
  // planned: still to come; null: nothing that day
  dot: 'done' | 'open' | 'planned' | null;
}

const DOT_WORDS = { done: 'completed', open: 'open', planned: 'planned' };
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Monday to Sunday: weekday letter, day number and a dot; today filled with the accent */
@Component({
  selector: 'app-week-strip',
  template: `
    <ol aria-label="This week">
      @for (day of days(); track day.date; let i = $index) {
        <li
          class="week-day"
          [class.today]="day.today"
          [attr.data-dot]="day.dot"
          [attr.aria-current]="day.today ? 'date' : null"
          [attr.aria-label]="label(day, i)"
        >
          <span class="week-letter" aria-hidden="true">{{ day.weekday }}</span>
          <span class="week-num num" aria-hidden="true">{{ day.day }}</span>
          <span class="week-dot" aria-hidden="true"></span>
        </li>
      }
    </ol>
  `,
  styleUrls: ['./week-strip.component.scss'],
  standalone: true,
})
export class WeekStripComponent {
  readonly days = input.required<StripDay[]>();

  /** e.g. "Monday 5, completed" */
  protected label(day: StripDay, index: number): string {
    return `${WEEKDAY_NAMES[index]} ${day.day}${day.dot ? `, ${DOT_WORDS[day.dot]}` : ''}`;
  }
}
