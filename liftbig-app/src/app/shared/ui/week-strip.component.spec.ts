import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StripDay, WeekStripComponent } from './week-strip.component';

// Monday 5 to Sunday 11 Oct 2026; today is Saturday 10
const DAYS: StripDay[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((weekday, i) => ({
  date: `2026-10-${String(5 + i).padStart(2, '0')}`,
  weekday,
  day: 5 + i,
  today: i === 5,
  dot: i === 0 ? 'done' : i === 2 ? 'open' : null,
}));

describe('WeekStripComponent', () => {
  let fixture: ComponentFixture<WeekStripComponent>;
  let picked: string[];
  let weeks: number[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [WeekStripComponent] });
    fixture = TestBed.createComponent(WeekStripComponent);
    picked = [];
    weeks = [];
    fixture.componentInstance.daySelected.subscribe((d) => picked.push(d));
    fixture.componentInstance.weekChange.subscribe((w) => weeks.push(w));
    fixture.componentRef.setInput('days', DAYS);
    fixture.componentRef.setInput('selected', '2026-10-10');
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  const el = () => fixture.nativeElement as HTMLElement;
  const dayButtons = () => Array.from(el().querySelectorAll<HTMLButtonElement>('ol button.week-day'));
  const button = (text: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim() === text)!;

  it('shows each day as a button and emits its date on tap', () => {
    expect(dayButtons().length).toBe(7);
    dayButtons()[2].click();
    expect(picked).toEqual(['2026-10-07']);
  });

  it('marks the selected day and says so to screen readers; today keeps aria-current', () => {
    fixture.componentRef.setInput('selected', '2026-10-07');
    fixture.detectChanges();
    const [mon, , wed, , , sat] = dayButtons();
    expect(wed.classList).toContain('selected');
    expect(wed.getAttribute('aria-label')).toBe('Wednesday 7, open, selected');
    expect(mon.getAttribute('aria-label')).toBe('Monday 5, completed');
    expect(sat.classList).not.toContain('selected');
    expect(sat.classList).toContain('today');
    expect(sat.getAttribute('aria-current')).toBe('date');
    expect(wed.getAttribute('aria-current')).toBeNull();
  });

  it('names the shown week: this week, else the week of its Monday', () => {
    expect(el().querySelector('ol')!.getAttribute('aria-label')).toBe('This week');
    fixture.componentRef.setInput(
      'days',
      DAYS.map((d) => ({ ...d, today: false })),
    );
    fixture.detectChanges();
    expect(el().querySelector('ol')!.getAttribute('aria-label')).toBe('Week of 5 October');
  });

  it('has visually hidden previous and next week buttons that emit -1 and +1', () => {
    const prev = button('Previous week');
    const next = button('Next week');
    expect(prev.classList).toContain('visually-hidden');
    expect(next.classList).toContain('visually-hidden');
    prev.click();
    next.click();
    expect(weeks).toEqual([-1, 1]);
  });

  describe('swipe', () => {
    // Drives the Ionic gesture with mouse events: down on the strip, moves
    // and up on the document
    function drag(dx: number, dy: number) {
      const strip = el().querySelector('ol')!;
      const box = strip.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const steps = 6;
      strip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
      for (let i = 1; i <= steps; i++) {
        document.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            clientX: x + (dx * i) / steps,
            clientY: y + (dy * i) / steps,
          }),
        );
      }
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + dx, clientY: y + dy }));
    }

    it('left shows the next week and right the previous one, once per swipe', () => {
      drag(-120, 4);
      expect(weeks).toEqual([1]);
      drag(120, -4);
      expect(weeks).toEqual([1, -1]);
      expect(picked).toEqual([]);
    });

    it('does nothing on a vertical scroll or a short drag', () => {
      drag(6, 140);
      drag(-12, 0);
      expect(weeks).toEqual([]);
    });

    // Spec § LB-35: Android made no click of the first tap on Today after a
    // swipe the browser had been kept from panning; the strip takes those moves
    describe('touch moves', () => {
      /** Touch down mid-strip, then one move by dx, dy; whether the move was cancelled */
      function touchMove(dx: number, dy: number): boolean {
        const strip = el().querySelector('ol')!;
        const box = strip.getBoundingClientRect();
        const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
        const touch = (cx: number, cy: number) => new Touch({ identifier: 1, target: strip, clientX: cx, clientY: cy });
        const down = touch(x, y);
        strip.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [down], changedTouches: [down] }));
        const moved = touch(x + dx, y + dy);
        const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [moved], changedTouches: [moved] });
        strip.dispatchEvent(move);
        strip.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [moved] }));
        return move.defaultPrevented;
      }

      it('takes a horizontal move from the browser', () => {
        expect(touchMove(-30, 4)).toBeTrue();
        expect(touchMove(30, -4)).toBeTrue();
      });

      it('leaves a vertical move to the page scroll', () => {
        expect(touchMove(4, 30)).toBeFalse();
        expect(touchMove(-4, -30)).toBeFalse();
      });
    });

    // Ionic hands moves over on the next animation frame. 18px stays under
    // the flick distance, as instant synthetic moves are always fast
    it('moves the days with the finger, and a short drag springs back', async () => {
      const strip = el().querySelector('ol')!;
      const box = strip.getBoundingClientRect();
      const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
      strip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
      for (const dx of [-6, -12, -18]) {
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + dx, clientY: y }));
      }
      await new Promise(requestAnimationFrame);
      expect(strip.style.transform).toMatch(/^translateX\(-\d+(\.\d+)?px\)$/);

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x - 18, clientY: y }));
      expect(weeks).toEqual([]);
      expect(strip.style.transform).toBe('');
    });
  });

  // Spec § LB-35 (Ivan, 2026-11-06): the strip is a pager; while dragging,
  // the week it moves towards shows alongside instead of empty space
  describe('neighbouring weeks', () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    function weekFrom(monday: Date, dot: StripDay['dot']): StripDay[] {
      return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((weekday, i) => {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        return {
          date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          weekday,
          day: d.getDate(),
          today: false,
          dot: i === 1 ? dot : null,
        };
      });
    }
    const PREV = weekFrom(new Date(2026, 8, 28), 'done');
    const NEXT = weekFrom(new Date(2026, 9, 12), 'planned');
    const AFTER_NEXT = weekFrom(new Date(2026, 9, 19), null);

    const strip = () => el().querySelector('ol')!;
    const peek = (side: 'prev' | 'next') => el().querySelector<HTMLElement>(`.week-peek.${side}`)!;
    const nums = (week: Element) => Array.from(week.querySelectorAll('.week-num')).map((n) => n.textContent!.trim());
    const x = (transform: string) => Number(/^translateX\((-?[\d.]+)px\)$/.exec(transform)?.[1]);
    const fromX = (week: Element) => x(String((week.getAnimations()[0].effect as KeyframeEffect).getKeyframes()[0]['transform']));

    function show(days: StripDay[], previousWeek: StripDay[], nextWeek: StripDay[]) {
      fixture.componentRef.setInput('days', days);
      fixture.componentRef.setInput('previousWeek', previousWeek);
      fixture.componentRef.setInput('nextWeek', nextWeek);
      fixture.detectChanges();
    }

    /** Down mid-strip and moves to dx, then waits a frame for Ionic to hand them over */
    async function dragTo(dx: number) {
      const box = strip().getBoundingClientRect();
      const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2];
      strip().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
      for (let i = 1; i <= 6; i++) {
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx + (dx * i) / 6, clientY: cy }));
      }
      await new Promise(requestAnimationFrame);
      return () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx + dx, clientY: cy }));
    }

    beforeEach(() => show(DAYS, PREV, NEXT));

    it('renders the previous and next weeks with their days and dots, just outside the shown one', () => {
      expect(nums(peek('prev'))).toEqual(['28', '29', '30', '1', '2', '3', '4']);
      expect(nums(peek('next'))).toEqual(['12', '13', '14', '15', '16', '17', '18']);
      expect(peek('prev').querySelectorAll('.peek-day')[1].getAttribute('data-dot')).toBe('done');
      expect(peek('next').querySelectorAll('.peek-day')[1].getAttribute('data-dot')).toBe('planned');

      const shown = strip().getBoundingClientRect();
      expect(peek('prev').getBoundingClientRect().right).toBeLessThan(shown.left);
      expect(peek('next').getBoundingClientRect().left).toBeGreaterThan(shown.right);
      expect(peek('next').getBoundingClientRect().width).toBeCloseTo(shown.width, 0);
    });

    it('are hidden from screen readers, take no focus and add no buttons', () => {
      for (const side of ['prev', 'next'] as const) {
        expect(peek(side).hasAttribute('inert')).toBeTrue();
        expect(peek(side).getAttribute('aria-hidden')).toBe('true');
        expect(peek(side).querySelectorAll('button, [tabindex], a').length).toBe(0);
      }
      expect(dayButtons().length).toBe(7);
      expect(el().querySelectorAll('.week-day').length).toBe(7);
      expect(el().querySelectorAll('button').length).toBe(9);
    });

    it('move with the shown week while dragging', async () => {
      const release = await dragTo(-30);
      const moved = strip().style.transform;
      expect(x(moved)).toBeLessThan(0);
      expect(peek('prev').style.transform).toBe(moved);
      expect(peek('next').style.transform).toBe(moved);
      // The next week stays the same distance from the shown one
      const gap = peek('next').getBoundingClientRect().left - strip().getBoundingClientRect().right;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(12);
      release();
    });

    it('a swipe past the threshold emits once, and the new week settles from where the drag left it', async () => {
      const release = await dragTo(-90);
      const distance = peek('next').offsetLeft;
      release();
      expect(weeks).toEqual([1]);
      // Until the new week renders, the row stays where the finger left it
      const held = x(strip().style.transform);
      expect(held).toBeLessThan(-40);
      expect(peek('next').style.transform).toBe(strip().style.transform);

      show(NEXT, DAYS, AFTER_NEXT);
      expect(nums(strip())).toEqual(['12', '13', '14', '15', '16', '17', '18']);
      expect(nums(peek('prev'))).toEqual(['5', '6', '7', '8', '9', '10', '11']);
      // The new week starts where the next week was at release, and the
      // last week where it was, so nothing jumps
      expect(fromX(strip())).toBeCloseTo(distance + held, 0);
      expect(fromX(peek('prev'))).toBeCloseTo(distance + held, 0);
      expect(strip().style.transform).toBe('');
      expect(weeks).toEqual([1]);
    });

    it('a short drag springs back with the neighbours and emits nothing', async () => {
      const release = await dragTo(-18);
      release();
      expect(weeks).toEqual([]);
      for (const week of [strip(), peek('prev'), peek('next')]) {
        expect(week.style.transform).toBe('');
        expect(fromX(week)).toBeLessThan(0);
      }
    });

    it('the previous and next buttons slide the whole row by one week', () => {
      button('Previous week').click();
      expect(weeks).toEqual([-1]);
      show(PREV, weekFrom(new Date(2026, 8, 21), null), DAYS);
      const distance = peek('next').offsetLeft;
      for (const week of [strip(), peek('prev'), peek('next')]) {
        expect(fromX(week)).toBeCloseTo(-distance, 0);
      }
    });
  });

  describe('week change motion', () => {
    const nextWeek = DAYS.map((d) => ({
      ...d,
      date: `2026-10-${String(d.day + 7).padStart(2, '0')}`,
      day: d.day + 7,
      today: false,
    }));
    const slides = () => el().querySelector('ol')!.getAnimations();

    it('does not animate the first week shown', () => {
      expect(slides().length).toBe(0);
    });

    it('slides a new week in from the side it comes from', () => {
      fixture.componentRef.setInput('days', nextWeek);
      fixture.detectChanges();
      const [slide] = slides();
      const [from] = (slide.effect as KeyframeEffect).getKeyframes();
      expect(from['transform']).toMatch(/^translateX\(\d/);

      slide.finish();
      fixture.componentRef.setInput('days', DAYS);
      fixture.detectChanges();
      const [back] = slides();
      expect((back.effect as KeyframeEffect).getKeyframes()[0]['transform']).toMatch(/^translateX\(-/);
    });

    it('does not animate a refresh of the same week', () => {
      fixture.componentRef.setInput('days', DAYS.map((d) => ({ ...d, dot: null })));
      fixture.detectChanges();
      expect(slides().length).toBe(0);
    });
  });
});
