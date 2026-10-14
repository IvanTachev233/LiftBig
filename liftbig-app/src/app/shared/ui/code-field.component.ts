import { Component, input, model, output } from '@angular/core';
import { IonicModule } from '@ionic/angular';

export const CODE_LENGTH = 6;

/**
 * The field for a mailed 6-digit code: numeric keyboard, one-time-code
 * autofill, and only the first 6 digits of whatever is typed or pasted.
 * Emits completed with the code once it has 6 digits.
 */
@Component({
  selector: 'app-code-field',
  template: `
    <ion-input
      class="input-field code-input"
      [label]="label()"
      labelPlacement="stacked"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      name="code"
      placeholder="000000"
      [value]="value()"
      (ionInput)="onInput($event)"
    ></ion-input>
  `,
  standalone: true,
  imports: [IonicModule],
})
export class CodeFieldComponent {
  readonly label = input('6-digit code');
  readonly value = model('');
  readonly completed = output<string>();

  protected onInput(event: Event) {
    const raw = (event as CustomEvent<{ value?: string | null }>).detail.value ?? '';
    const code = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    // Writes back so dropped characters disappear from the field too
    (event.target as HTMLIonInputElement).value = code;
    this.value.set(code);
    if (code.length === CODE_LENGTH) this.completed.emit(code);
  }
}
