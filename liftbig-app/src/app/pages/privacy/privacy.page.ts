import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { openOutline } from 'ionicons/icons';
import { AgreementsService, OPTIONAL_PURPOSES, OptionalPurpose, Policies } from '../../core/agreements.service';
import { AuthService } from '../../core/auth.service';
import { CONSENT_SAVED, OPTIONAL_CONSENT_TEXTS } from '../../core/consent-texts';
import { ProfileService } from '../../core/profile.service';
import { AccountActionsService } from '../profile/account-actions.service';

// Profile → Privacy: the optional consents as toggles that save on change,
// when the training data consent was given (withdrawn by deleting the
// account), both documents with their versions and a data request by email
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['./privacy.page.scss'],
  standalone: true,
  imports: [IonicModule, DatePipe],
})
export class PrivacyPage implements ViewWillEnter {
  private profileService = inject(ProfileService);
  private agreements = inject(AgreementsService);
  private accountActions = inject(AccountActionsService);
  private toastController = inject(ToastController);
  private auth = inject(AuthService);

  readonly purposes = OPTIONAL_PURPOSES;
  readonly texts = OPTIONAL_CONSENT_TEXTS;
  readonly status = this.agreements.status;
  readonly policies = signal<Policies | null>(null);
  /** What the toggles show; a failed save puts the old value back */
  readonly choices = signal<Record<OptionalPurpose, boolean>>({ video_training: false, product_emails: false });
  readonly agreedOn = computed(() => {
    const status = this.status();
    return status?.consents.health_data ? status.consentsUpdatedAt.health_data : null;
  });
  readonly dataRequestUrl = computed(() => {
    const email = this.policies()?.contactEmail;
    return email ? `mailto:${email}?subject=LiftBig%20data%20request` : null;
  });
  readonly backHref = computed(() => (this.auth.currentUser()?.role === 'COACH' ? '/coach/profile' : '/profile'));
  readonly termsUrl = this.agreements.documentUrl('terms');
  readonly privacyUrl = this.agreements.documentUrl('privacy');

  constructor() {
    addIcons({ openOutline });
  }

  ionViewWillEnter() {
    this.showStored();
    this.profileService.getMe().subscribe({
      next: () => this.showStored(),
      error: () => void this.presentToast("Couldn't load your privacy settings"),
    });
    this.agreements.policies().subscribe({
      next: (policies) => this.policies.set(policies),
      // The links work without the versions
      error: () => undefined,
    });
  }

  toggle(purpose: OptionalPurpose, granted: boolean) {
    if (granted === this.choices()[purpose]) return;
    this.choices.update((choices) => ({ ...choices, [purpose]: granted }));
    this.agreements.setConsent(purpose, granted).subscribe({
      next: () => void this.presentToast(CONSENT_SAVED[purpose][granted ? 'on' : 'off'], 'success'),
      error: () => {
        this.choices.update((choices) => ({ ...choices, [purpose]: !granted }));
        void this.presentToast("Couldn't save. Check your connection.");
      },
    });
  }

  deleteAccount() {
    void this.accountActions.deleteAccount();
  }

  private showStored() {
    const consents = this.status()?.consents;
    if (consents) {
      this.choices.set({ video_training: consents.video_training, product_emails: consents.product_emails });
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger' = 'danger') {
    const toast = await this.toastController.create({ message, duration: 2500, color });
    await toast.present();
  }
}
