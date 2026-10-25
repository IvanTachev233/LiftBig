import { Component, inject, input, model } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { AgreementChoices, AgreementsService, OptionalPurpose } from '../../core/agreements.service';
import { HEALTH_DATA_STATEMENT, OPTIONAL_CONSENT_TEXTS } from '../../core/consent-texts';

/**
 * The required boxes (Terms of Use with the Privacy Policy, the training
 * data statement) and the optional toggles, for Sign up and the "We've
 * updated our terms" screen. Links open the pages in the browser without
 * ticking the box.
 */
@Component({
  selector: 'app-agreement-checks',
  template: `
    @if (terms()) {
      <ion-checkbox
        class="agree-check terms-check"
        labelPlacement="end"
        justify="start"
        alignment="start"
        [checked]="choices().terms"
        (ionChange)="set('terms', $any($event).detail.checked)"
      >
        I'm 18 or older and agree to the
        <a [href]="termsUrl" target="_blank" rel="noopener" (click)="$event.stopPropagation()">Terms of Use</a>. I've
        read the
        <a [href]="privacyUrl" target="_blank" rel="noopener" (click)="$event.stopPropagation()">Privacy Policy</a>.
      </ion-checkbox>
    }
    @if (healthData()) {
      <ion-checkbox
        class="agree-check health-check"
        labelPlacement="end"
        justify="start"
        alignment="start"
        [checked]="choices().health_data"
        (ionChange)="set('health_data', $any($event).detail.checked)"
      >
        {{ healthStatement }}
      </ion-checkbox>
    }
    @if (optional().length) {
      <div class="optional" role="group" aria-labelledby="optional-heading">
        <h2 class="eyebrow" id="optional-heading">Optional</h2>
        @for (purpose of optional(); track purpose) {
          <ion-toggle
            class="optional-toggle"
            justify="space-between"
            [attr.data-purpose]="purpose"
            [helperText]="texts[purpose].text"
            [checked]="choices()[purpose]"
            (ionChange)="set(purpose, $any($event).detail.checked)"
          >
            {{ texts[purpose].title }}
          </ion-toggle>
        }
        <p class="optional-footer">You can change these any time in Profile → Privacy.</p>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .agree-check {
      font-size: 14px;
      line-height: 1.45;
    }

    ion-checkbox::part(label),
    ion-toggle::part(label) {
      white-space: normal;
    }

    a {
      color: var(--accent-text);
    }

    .optional {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 8px;
    }

    h2,
    .optional-footer {
      margin: 0;
      font-size: 12px;
    }

    .optional-footer {
      font-size: 13px;
      color: var(--text-2);
    }
  `,
  standalone: true,
  imports: [IonicModule],
})
export class AgreementChecksComponent {
  private agreements = inject(AgreementsService);

  /** Which parts to show */
  readonly terms = input(false);
  readonly healthData = input(false);
  readonly optional = input<readonly OptionalPurpose[]>([]);
  readonly choices = model.required<AgreementChoices>();

  readonly termsUrl = this.agreements.documentUrl('terms');
  readonly privacyUrl = this.agreements.documentUrl('privacy');
  readonly healthStatement = HEALTH_DATA_STATEMENT;
  readonly texts = OPTIONAL_CONSENT_TEXTS;

  set(choice: keyof AgreementChoices, value: boolean) {
    this.choices.update((choices) => ({ ...choices, [choice]: value }));
  }
}
