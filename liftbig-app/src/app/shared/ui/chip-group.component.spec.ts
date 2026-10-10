import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChipGroupComponent, ChipOption } from './chip-group.component';

@Component({
  imports: [ChipGroupComponent],
  template: `<app-chip-group label="Sport" [options]="options" [(value)]="value" />`,
})
class HostComponent {
  options: ChipOption[] = [
    { value: 'oly', label: 'Olympic' },
    { value: 'pl', label: 'Powerlifting' },
    { value: 'sm', label: 'Strongman' },
  ];
  value = signal<string | null>('oly');
}

describe('ChipGroupComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const chips = () => Array.from(el().querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const checked = () => chips().map((c) => c.getAttribute('aria-checked'));
  const tabStops = () => chips().map((c) => c.tabIndex);
  const key = (chip: HTMLElement, k: string) => {
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };

  it('is a labelled radiogroup of chips', () => {
    const group = el().querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Sport');
    expect(chips().map((c) => c.textContent!.trim())).toEqual(['Olympic', 'Powerlifting', 'Strongman']);
    expect(chips().every((c) => c.type === 'button' && c.classList.contains('chip'))).toBeTrue();
  });

  it('marks the selected chip and makes it the only tab stop', () => {
    expect(checked()).toEqual(['true', 'false', 'false']);
    expect(tabStops()).toEqual([0, -1, -1]);
  });

  it('selects a chip on tap and updates the bound value', () => {
    chips()[1].click();
    fixture.detectChanges();
    expect(host.value()).toBe('pl');
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(tabStops()).toEqual([-1, 0, -1]);
  });

  it('keeps the selection when the selected chip is tapped again', () => {
    chips()[0].click();
    fixture.detectChanges();
    expect(host.value()).toBe('oly');
  });

  it('moves the selection and focus with the arrow keys, wrapping at the ends', () => {
    key(chips()[0], 'ArrowRight');
    expect(host.value()).toBe('pl');
    expect(document.activeElement).toBe(chips()[1]);

    key(chips()[1], 'ArrowDown');
    expect(host.value()).toBe('sm');

    key(chips()[2], 'ArrowRight');
    expect(host.value()).toBe('oly');
    expect(document.activeElement).toBe(chips()[0]);

    key(chips()[0], 'ArrowLeft');
    expect(host.value()).toBe('sm');

    key(chips()[2], 'ArrowUp');
    expect(host.value()).toBe('pl');
  });

  it('jumps to the first and last chip with Home and End', () => {
    key(chips()[0], 'End');
    expect(host.value()).toBe('sm');
    key(chips()[2], 'Home');
    expect(host.value()).toBe('oly');
  });

  it('makes the first chip the tab stop when nothing is selected', () => {
    host.value.set(null);
    fixture.detectChanges();
    expect(checked()).toEqual(['false', 'false', 'false']);
    expect(tabStops()).toEqual([0, -1, -1]);
  });
});
