import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatTilesComponent } from './stat-tiles.component';

describe('StatTilesComponent', () => {
  let fixture: ComponentFixture<StatTilesComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatTilesComponent] });
    fixture = TestBed.createComponent(StatTilesComponent);
    fixture.componentRef.setInput('tiles', [
      { label: 'This week', value: '4', unit: 'sessions' },
      { label: 'Volume', value: '1,157', unit: 'kg' },
      { label: 'Clients', value: '3' },
    ]);
    fixture.detectChanges();
  });

  const tiles = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tile'));
  const text = (tile: Element, selector: string) => tile.querySelector(selector)?.textContent?.trim() ?? null;

  it('shows a tile per stat with its label, value and unit', () => {
    expect(tiles().map((t) => [text(t, '.tile-label'), text(t, '.tile-value'), text(t, '.tile-unit')])).toEqual([
      ['This week', '4', 'sessions'],
      ['Volume', '1,157', 'kg'],
      ['Clients', '3', null],
    ]);
  });

  it('sets the value in the number face', () => {
    expect(tiles()[0].querySelector('.tile-value')!.classList).toContain('num');
  });
});
