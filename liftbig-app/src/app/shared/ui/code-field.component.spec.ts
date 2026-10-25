import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CodeFieldComponent } from './code-field.component';

@Component({
  template: `<app-code-field [(value)]="code" (completed)="completed.push($event)" />`,
  imports: [CodeFieldComponent],
})
class HostComponent {
  code = signal('');
  completed: string[] = [];
}

describe('CodeFieldComponent', () => {
  function create() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('ion-input') as HTMLIonInputElement;
    const type = (value: string) => {
      input.dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
      fixture.detectChanges();
    };
    return { fixture, host: fixture.componentInstance, input, type };
  }

  it('is a labelled 6-digit field with the numeric keyboard and one-time-code autofill', () => {
    const { input } = create();
    expect(input.label).toBe('6-digit code');
    expect(input.labelPlacement).toBe('stacked');
    expect(input.classList).toContain('input-field');
    expect(input.inputmode).toBe('numeric');
    expect(input.autocomplete).toBe('one-time-code');
    // No native maxlength: it would cut a pasted "123 456" before the spaces go
    expect(input.maxlength).toBeUndefined();
  });

  it('keeps only digits, so a pasted "123 456" or "12-34-56" works', () => {
    const { host, input, type } = create();
    type('123 456');
    expect(host.code()).toBe('123456');
    expect(input.value).toBe('123456');
    type('12-34-5x');
    expect(host.code()).toBe('12345');
    expect(input.value).toBe('12345');
    type('1234567');
    expect(host.code()).toBe('123456');
  });

  it('reports a complete code once 6 digits are in', () => {
    const { host, type } = create();
    type('12345');
    expect(host.completed).toEqual([]);
    type('Your code: 654321');
    expect(host.completed).toEqual(['654321']);
  });
});
