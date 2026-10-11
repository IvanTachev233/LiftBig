import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateBlockRowComponent } from './date-block-row.component';

@Component({
  imports: [DateBlockRowComponent],
  template: `
    <app-date-block-row [date]="date" [title]="title" [sub]="sub" [subTone]="tone">
      <span tags class="tag">PR</span>
      <span trailing class="trailing">258 kg</span>
    </app-date-block-row>
  `,
})
class HostComponent {
  date = '2026-10-13T00:00:00.000Z';
  title = 'Snatch & Back Squat';
  sub: string | null = 'Completed · 3 exercises';
  tone: 'default' | 'accent' | 'muted' = 'default';
}

describe('DateBlockRowComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) => el().querySelector(selector)?.textContent?.trim() ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('shows the weekday and day of the workout calendar day', () => {
    expect(text('.date-block .weekday')).toBe('TUE');
    expect(text('.date-block .day')).toBe('13');
    expect(el().querySelector('time')!.getAttribute('datetime')).toBe('2026-10-13');
  });

  it('reads the calendar day from the date, not the local time of the timestamp', () => {
    // Midnight UTC is the previous evening west of UTC
    fixture.componentInstance.date = '2026-10-01T00:00:00.000Z';
    fixture.detectChanges();
    expect(text('.date-block .weekday')).toBe('THU');
    expect(text('.date-block .day')).toBe('1');
  });

  it('accepts a plain YYYY-MM-DD day', () => {
    fixture.componentInstance.date = '2026-03-09';
    fixture.detectChanges();
    expect(text('.date-block .weekday')).toBe('MON');
    expect(text('.date-block .day')).toBe('9');
  });

  it('shows the title and sub, with tags and a trailing slot', () => {
    expect(text('.row-title')).toBe('Snatch & Back Squat');
    expect(text('.row-sub')).toBe('Completed · 3 exercises');
    expect(el().querySelector('.row-heading .tag')).not.toBeNull();
    expect(el().querySelector('.row-trailing .trailing')).not.toBeNull();
  });

  it('marks the sub line with its tone', () => {
    expect(el().querySelector('.row-sub')!.className).toBe('row-sub');
    fixture.componentInstance.tone = 'accent';
    fixture.detectChanges();
    expect(el().querySelector('.row-sub')!.classList).toContain('tone-accent');
    fixture.componentInstance.tone = 'muted';
    fixture.detectChanges();
    expect(el().querySelector('.row-sub')!.classList).toContain('tone-muted');
  });

  it('leaves out the sub line when there is none', () => {
    fixture.componentInstance.sub = null;
    fixture.detectChanges();
    expect(el().querySelector('.row-sub')).toBeNull();
  });
});
