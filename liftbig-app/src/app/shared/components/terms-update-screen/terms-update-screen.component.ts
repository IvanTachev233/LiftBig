import { Component, computed, inject, signal } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import {
  AgreementChoices,
  AgreementsService,
  NO_CHOICES,
  OPTIONAL_PURPOSES,
  OptionalPurpose,
  PendingAgreement,
  PolicyDocument,
  isOutdated,
} from '../../../core/agreements.service';
import { AccountActionsService } from '../../../pages/profile/account-actions.service';
import { AgreementChecksComponent } from '../../ui/agreement-checks.component';

// Heading and intro by what is listed (docs/privacy/consent-texts.md). The
// first rollout lists all three for a user who has never given the training
// data consent
const FIRST_ROLLOUT = {
  heading: "We've updated our terms",
  intro:
    'LiftBig now has Terms of Use, and our Privacy Policy explains more: what we use your data for and why, ' +
    'your rights, and two new choices you can make. Please read them and confirm to keep using LiftBig.',
};
const ONLY: Partial<Record<PendingAgreement, { heading: string; intro: string }>> = {
  terms: {
    heading: "We've updated our Terms of Use",
    intro: "We've changed our Terms of Use. Please read them and tick the box to keep using LiftBig.",
  },
  privacy: {
    heading: "We've updated our Privacy Policy",
    intro: "We've changed our Privacy Policy. Please read what's new; there's nothing new to agree to.",
  },
  health_data: {
    heading: 'Please confirm how we use your training data',
    intro:
      "We've reworded what you agree to about your training data. Please read it and tick the box to keep using LiftBig.",
  },
};
const SOME_CHANGED = {
  heading: "We've updated our terms",
  intro: "We've changed some of what you agreed to. Please read the changes and confirm to keep using LiftBig.",
};

/**
 * "We've updated our terms", over the pages while the signed-in user has
 * something to accept (AppComponent shows it). It asks for the boxes of what
 * is listed, offers the optional choices the user hasn't made yet, and
 * Continue records every listed item at its current version. Only Log out
 * and Delete account work without accepting; the delete sheet opens above
 * this screen, and "Update LiftBig" covers it.
 */
@Component({
  selector: 'app-terms-update-screen',
  templateUrl: './terms-update-screen.component.html',
  styleUrls: ['./terms-update-screen.component.scss'],
  standalone: true,
  imports: [IonicModule, AgreementChecksComponent],
})
export class TermsUpdateScreenComponent {
  private agreements = inject(AgreementsService);
  private accountActions = inject(AccountActionsService);
  private toastController = inject(ToastController);

  private readonly pending = this.agreements.pending;
  readonly showTerms = computed(() => this.pending().includes('terms'));
  readonly showHealth = computed(() => this.pending().includes('health_data'));
  /** The Terms box links to the policy; without it, a link of its own */
  readonly privacyLink = computed(() => this.pending().includes('privacy') && !this.showTerms());
  readonly optional = computed<OptionalPurpose[]>(() =>
    OPTIONAL_PURPOSES.filter((purpose) => this.agreements.status()?.consentsUpdatedAt[purpose] === null),
  );
  private readonly texts = computed(() => {
    const pending = this.pending();
    const agreedBefore = !!this.agreements.status()?.consentsUpdatedAt.health_data;
    if (pending.length === 3 && !agreedBefore) return FIRST_ROLLOUT;
    return (pending.length === 1 && ONLY[pending[0]]) || SOME_CHANGED;
  });
  readonly heading = computed(() => this.texts().heading);
  readonly intro = computed(() => this.texts().intro);

  readonly choices = signal<AgreementChoices>(NO_CHOICES);
  readonly saving = signal(false);
  readonly canContinue = computed(
    () =>
      !this.saving() &&
      (!this.showTerms() || this.choices().terms) &&
      (!this.showHealth() || this.choices().health_data),
  );
  readonly privacyUrl = this.agreements.documentUrl('privacy');

  continue() {
    if (!this.canContinue()) return;
    this.saving.set(true);
    const choices = this.choices();
    const optional: Partial<Record<OptionalPurpose, boolean>> = {};
    for (const purpose of this.optional()) optional[purpose] = choices[purpose];
    this.agreements
      .accept({
        documents: this.pending().filter((item): item is PolicyDocument => item !== 'health_data'),
        healthData: this.showHealth(),
        optional,
      })
      .subscribe({
        // Accepted: the payload lists nothing, so AppComponent removes the screen
        next: () => this.saving.set(false),
        error: (error: unknown) => {
          this.saving.set(false);
          void this.presentToast(
            isOutdated(error)
              ? "LiftBig's terms have just changed. Please read them and try again."
              : "Couldn't save. Check your connection.",
          );
        },
      });
  }

  logout() {
    this.accountActions.logout();
  }

  deleteAccount() {
    void this.accountActions.deleteAccount();
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({ message, duration: 2500, color: 'danger' });
    await toast.present();
  }
}
