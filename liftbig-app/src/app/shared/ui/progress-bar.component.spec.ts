import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProgressBarComponent } from './progress-bar.component';

describe('ProgressBarComponent', () => {
  let fixture: ComponentFixture<ProgressBarComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ProgressBarComponent] });
    fixture = TestBed.createComponent(ProgressBarComponent);
  });

  function render(inputs: Record<string, unknown>) {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const bar = () => (fixture.nativeElement as HTMLElement).querySelector('[role="progressbar"]')!;
  const fill = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.fill')!;

  it('is a labelled progressbar with its value and maximum', () => {
    render({ value: 3, max: 12, label: 'Sets logged' });
    expect(bar().getAttribute('aria-label')).toBe('Sets logged');
    expect(bar().getAttribute('aria-valuemin')).toBe('0');
    expect(bar().getAttribute('aria-valuenow')).toBe('3');
    expect(bar().getAttribute('aria-valuemax')).toBe('12');
  });

  it('fills the share of the plain bar', () => {
    render({ value: 3, max: 12, label: 'Sets' });
    expect(fill().style.width).toBe('25%');
  });

  it('clamps the fill to 0–100% and handles an empty maximum', () => {
    render({ value: 15, max: 12, label: 'Sets' });
    expect(fill().style.width).toBe('100%');
    render({ value: 0, max: 0, label: 'Sets' });
    expect(fill().style.width).toBe('0%');
  });

  it('turns to the done colour when complete', () => {
    render({ value: 11, max: 12, label: 'Sets' });
    expect(bar().classList).not.toContain('complete');
    render({ value: 12, max: 12, label: 'Sets' });
    expect(bar().classList).toContain('complete');
  });

  it('draws one segment per step when segmented, the first ones filled', () => {
    const el = render({ value: 2, max: 5, label: 'Sessions', segmented: true });
    const segments = Array.from(el.querySelectorAll('.segment'));
    expect(segments.length).toBe(5);
    expect(segments.map((s) => s.classList.contains('filled'))).toEqual([true, true, false, false, false]);
    expect(el.querySelector('.fill')).toBeNull();
  });
});
