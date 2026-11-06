import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  afterRenderEffect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Gesture, GestureController, GestureDetail } from '@ionic/angular';

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
// A swipe changes the week past this many pixels, or a quick flick past half of it
const SWIPE_PX = 40;
const FLICK_PX_PER_MS = 0.3;
// A tap that ends a swipe doesn't also select a day
const CLICK_AFTER_SWIPE_MS = 300;
// A new week settles into place; a short drag springs back
const SLIDE_MS = 220;
const SPRING_MS = 180;
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Monday to Sunday: weekday letter, day number and a dot; today filled with
 * the accent. Each day is a button; swiping left or right, or the visually
 * hidden previous/next buttons (shown while keyboard-focused), change the
 * week. A pager: the previous and next weeks sit just outside the shown one
 * and move with it, so a drag shows the week it moves towards, and a new
 * week settles into place from where the row was.
 */
@Component({
  selector: 'app-week-strip',
  template: `
    <button type="button" class="week-nav visually-hidden" (click)="weekChange.emit(-1)">Previous week</button>
    <div class="week-viewport">
      <ol #strip [attr.aria-label]="weekLabel()">
        @for (day of days(); track day.date; let i = $index) {
          <li>
            <button
              type="button"
              class="week-day"
              [class.today]="day.today"
              [class.selected]="day.date === selected()"
              [attr.data-dot]="day.dot"
              [attr.aria-current]="day.today ? 'date' : null"
              [attr.aria-label]="label(day, i)"
              (click)="select(day)"
            >
              <ng-container *ngTemplateOutlet="cell; context: { $implicit: day }" />
            </button>
          </li>
        }
      </ol>
      <!-- The neighbouring weeks: only seen while the row moves -->
      <div #before class="week-peek prev" inert aria-hidden="true">
        <ng-container *ngTemplateOutlet="peekDays; context: { $implicit: previousWeek() }" />
      </div>
      <div #after class="week-peek next" inert aria-hidden="true">
        <ng-container *ngTemplateOutlet="peekDays; context: { $implicit: nextWeek() }" />
      </div>
    </div>
    <button type="button" class="week-nav next visually-hidden" (click)="weekChange.emit(1)">Next week</button>

    <ng-template #peekDays let-week>
      @for (day of week; track day.date) {
        <span class="peek-day" [class.today]="day.today" [class.selected]="day.date === selected()" [attr.data-dot]="day.dot">
          <ng-container *ngTemplateOutlet="cell; context: { $implicit: day }" />
        </span>
      }
    </ng-template>
    <ng-template #cell let-day>
      <span class="week-letter" aria-hidden="true">{{ day.weekday }}</span>
      <span class="week-num num" aria-hidden="true">{{ day.day }}</span>
      <span class="week-dot" aria-hidden="true"></span>
    </ng-template>
  `,
  styleUrls: ['./week-strip.component.scss'],
  standalone: true,
  imports: [NgTemplateOutlet],
})
export class WeekStripComponent implements AfterViewInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private gestures = inject(GestureController);
  private zone = inject(NgZone);
  private strip = viewChild.required<ElementRef<HTMLOListElement>>('strip');
  private before = viewChild.required<ElementRef<HTMLElement>>('before');
  private after = viewChild.required<ElementRef<HTMLElement>>('after');

  readonly days = input.required<StripDay[]>();
  /** The selected day, YYYY-MM-DD */
  readonly selected = input<string | null>(null);
  /** The weeks either side, shown beside it while the row moves */
  readonly previousWeek = input<StripDay[]>([]);
  readonly nextWeek = input<StripDay[]>([]);
  readonly daySelected = output<string>();
  /** +1 for the next week, -1 for the previous one */
  readonly weekChange = output<number>();

  private gesture?: Gesture;
  private swipedAt = 0;
  // The Monday shown, to tell a week change (settles in) from a refresh
  private shownMonday: string | null = null;
  // Where a drag started from (a week still settling) and how far the row
  // may move: one week either way
  private dragFrom = 0;
  private maxDrag = 0;
  // A swipe's week change, until the new week renders: its direction and
  // where the finger left the row
  private pending: { direction: 1 | -1; at: number } | null = null;
  private pendingCheck = 0;
  private touchStart: { x: number; y: number } | null = null;

  // Android (WebView 133, API 36 emulator) made no click of a tap within
  // ~300 ms after a horizontal swipe that touch-action: pan-y had kept the
  // browser from panning, so the first tap on Today after a swipe was lost.
  // Cancelling the horizontal moves takes the swipe from the browser entirely
  private readonly onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    this.touchStart = t ? { x: t.clientX, y: t.clientY } : null;
  };
  private readonly onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || !this.touchStart || !e.cancelable) return;
    if (Math.abs(t.clientX - this.touchStart.x) > Math.abs(t.clientY - this.touchStart.y)) e.preventDefault();
  };

  constructor() {
    afterRenderEffect({
      earlyRead: () => ({ monday: this.days()[0]?.date ?? null, distance: this.weekDistance() }),
      write: (shown) => {
        const { monday, distance } = shown();
        const last = this.shownMonday;
        this.shownMonday = monday;
        if (!last || !monday || last === monday) return;
        // The new week starts where the week it replaces was (the dragged
        // neighbour, or one week to the side for the buttons), so nothing jumps
        const direction = monday > last ? 1 : -1;
        const at = this.pending?.direction === direction ? this.pending.at : 0;
        this.pending = null;
        this.settle(direction * distance + at, SLIDE_MS);
      },
    });
  }

  ngAfterViewInit() {
    // Outside Angular's zone, so following the finger doesn't run change
    // detection on every move; the week change goes back into it
    this.gesture = this.gestures.create({
      el: this.host.nativeElement,
      gestureName: 'week-strip-swipe',
      direction: 'x',
      onStart: () => this.dragStart(),
      onMove: (detail) => this.follow(detail),
      onEnd: (detail) => this.swipeEnd(detail),
    });
    this.gesture.enable();
    const host = this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      host.addEventListener('touchstart', this.onTouchStart, { passive: true });
      host.addEventListener('touchmove', this.onTouchMove, { passive: false });
    });
  }

  ngOnDestroy() {
    this.gesture?.destroy();
    cancelAnimationFrame(this.pendingCheck);
    const host = this.host.nativeElement;
    host.removeEventListener('touchstart', this.onTouchStart);
    host.removeEventListener('touchmove', this.onTouchMove);
  }

  /** "This week", or e.g. "Week of 5 October" */
  protected weekLabel(): string {
    const days = this.days();
    if (days.some((d) => d.today) || !days.length) return 'This week';
    const [year, month, date] = days[0].date.split('-').map(Number);
    const monday = new Date(year, month - 1, date);
    return `Week of ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
  }

  /** e.g. "Monday 5, completed, selected" */
  protected label(day: StripDay, index: number): string {
    const dot = day.dot ? `, ${DOT_WORDS[day.dot]}` : '';
    const selected = day.date === this.selected() ? ', selected' : '';
    return `${WEEKDAY_NAMES[index]} ${day.day}${dot}${selected}`;
  }

  protected select(day: StripDay) {
    if (Date.now() - this.swipedAt < CLICK_AFTER_SWIPE_MS) return;
    this.daySelected.emit(day.date);
  }

  /** A drag picks the row up where it is, also mid-settle */
  private dragStart() {
    const strip = this.strip().nativeElement;
    const transform = getComputedStyle(strip).transform;
    this.dragFrom = transform && transform !== 'none' ? new DOMMatrix(transform).m41 : 0;
    this.maxDrag = this.weekDistance();
    for (const week of this.weeks()) week.getAnimations().forEach((a) => a.cancel());
    this.place(this.dragFrom);
  }

  /** The row moves with a horizontal drag, at most one week either way */
  private follow({ deltaX, deltaY }: GestureDetail) {
    this.place(this.dragged(deltaX, deltaY));
  }

  private swipeEnd({ deltaX, deltaY, velocityX }: GestureDetail) {
    const at = this.dragged(deltaX, deltaY);
    this.dragFrom = 0;
    const distance = Math.abs(deltaX);
    const flick = distance >= SWIPE_PX / 2 && Math.abs(velocityX) >= FLICK_PX_PER_MS;
    if (distance <= Math.abs(deltaY) || (distance < SWIPE_PX && !flick)) {
      this.settle(at, SPRING_MS);
      return;
    }
    this.swipedAt = Date.now();
    const direction = deltaX < 0 ? 1 : -1;
    // The row stays where the finger left it until the new week renders
    this.place(at);
    this.pending = { direction, at };
    this.zone.run(() => this.weekChange.emit(direction));
    // The week didn't change (nothing answered the emit): spring back
    cancelAnimationFrame(this.pendingCheck);
    this.pendingCheck = requestAnimationFrame(() => {
      if (!this.pending) return;
      this.pending = null;
      this.settle(at, SPRING_MS);
    });
  }

  private dragged(deltaX: number, deltaY: number): number {
    const at = this.dragFrom + (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : 0);
    return Math.max(-this.maxDrag, Math.min(this.maxDrag, at));
  }

  /** The shown week and its neighbours, which always move together */
  private weeks(): HTMLElement[] {
    return [this.strip().nativeElement, this.before().nativeElement, this.after().nativeElement];
  }

  /** From the shown week to the next one: its width plus the gap */
  private weekDistance(): number {
    return this.after().nativeElement.offsetLeft;
  }

  private place(x: number) {
    const transform = x ? `translateX(${x}px)` : '';
    for (const week of this.weeks()) week.style.transform = transform;
  }

  /** The row glides from x back to the shown week */
  private settle(x: number, duration: number) {
    this.place(0);
    if (!x || !this.motionAllowed()) return;
    for (const week of this.weeks()) {
      week.animate([{ transform: `translateX(${x}px)` }, { transform: 'translateX(0)' }], { duration, easing: EASE_OUT });
    }
  }

  private motionAllowed(): boolean {
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
}
