import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusPillComponent, StatusPillKind } from './status-pill.component';

describe('StatusPillComponent', () => {
  let fixture: ComponentFixture<StatusPillComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatusPillComponent] });
    fixture = TestBed.createComponent(StatusPillComponent);
  });

  function render(inputs: Record<string, unknown>) {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels: [StatusPillKind, string][] = [
    ['today', 'Today'],
    ['planned', 'Planned'],
    ['done', 'Done'],
    ['missed', 'Missed'],
    ['in-progress', 'In progress'],
    ['pr', 'PR'],
    ['coach', 'Coach'],
    ['program', 'Program'],
  ];

  for (const [kind, label] of labels) {
    it(`reads "${label}" with the ${kind} colours`, () => {
      const pill = render({ kind });
      expect(pill.textContent!.trim()).toBe(label);
      expect(pill.classList).toContain(`pill-${kind}`);
    });
  }

  it('shows a given label instead of the default', () => {
    const pill = render({ kind: 'planned', label: 'Not started' });
    expect(pill.textContent!.trim()).toBe('Not started');
    expect(pill.classList).toContain('pill-planned');
  });

  it('has a small size for tags beside a title', () => {
    expect(render({ kind: 'pr' }).classList).not.toContain('pill-sm');
    expect(render({ kind: 'pr', size: 'sm' }).classList).toContain('pill-sm');
  });

  it('is plain text, not a live region or a control', () => {
    const pill = render({ kind: 'today' });
    expect(pill.getAttribute('role')).toBeNull();
    expect(pill.querySelector('button')).toBeNull();
  });
});
