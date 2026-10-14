import { Component, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { ProfileService } from '../../core/profile.service';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';

const MIN_LENGTH = 6;

const plural = (n: number, word: string, many: string) => `${n} ${n === 1 ? word : many}`;

function errorMessage(err: HttpErrorResponse): string {
  const body = (err.error ?? {}) as { attemptsLeft?: number; retryAfterMinutes?: number };
  if (err.status === 403) {
    const left = body.attemptsLeft;
    return left === undefined
      ? 'Your current password is incorrect.'
      : `Your current password is incorrect. ${plural(left, 'try', 'tries')} left.`;
  }
  if (err.status === 429) {
    const minutes = body.retryAfterMinutes ?? 15;
    return `Too many wrong passwords. Try again in ${plural(minutes, 'minute', 'minutes')}.`;
  }
  return "Couldn't change your password. Try again.";
}

/**
 * Sheet that changes the password itself, so a wrong current password keeps
 * it open with an error; confirms with true once the API accepts.
 */
@Component({
  selector: 'app-change-password-sheet',
  template: `
    <app-bottom-sheet
      title="Change password"
      helper="Your new password needs at least 6 characters."
      primaryLabel="Change password"
      [primaryDisabled]="!canSave || saving"
      (primary)="save()"
    >
      <div class="password-fields">
        <ion-input
          class="input-field password-input current-password"
          label="Current password"
          labelPlacement="stacked"
          autocomplete="current-password"
          [type]="showCurrent ? 'text' : 'password'"
          [(ngModel)]="currentPassword"
        >
          <button
            slot="end"
            type="button"
            class="password-toggle"
            [attr.aria-pressed]="showCurrent"
            [attr.aria-label]="(showCurrent ? 'Hide' : 'Show') + ' current password'"
            (click)="showCurrent = !showCurrent"
          >
            <ion-icon [name]="showCurrent ? 'eye-off-outline' : 'eye-outline'" aria-hidden="true"></ion-icon>
          </button>
        </ion-input>
        <ion-input
          class="input-field password-input new-password"
          label="New password"
          labelPlacement="stacked"
          autocomplete="new-password"
          [type]="showNew ? 'text' : 'password'"
          [(ngModel)]="newPassword"
        >
          <button
            slot="end"
            type="button"
            class="password-toggle"
            [attr.aria-pressed]="showNew"
            [attr.aria-label]="(showNew ? 'Hide' : 'Show') + ' new password'"
            (click)="showNew = !showNew"
          >
            <ion-icon [name]="showNew ? 'eye-off-outline' : 'eye-outline'" aria-hidden="true"></ion-icon>
          </button>
        </ion-input>
        @if (error) {
          <p class="sheet-error" role="alert">{{ error }}</p>
        }
      </div>
    </app-bottom-sheet>
  `,
  styles: `
    .password-fields {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sheet-error {
      margin: 0;
      color: var(--danger-text);
      font-size: 13px;
    }
  `,
  standalone: true,
  imports: [IonicModule, FormsModule, BottomSheetComponent],
})
export class ChangePasswordSheetComponent {
  private modalController = inject(ModalController);
  private profileService = inject(ProfileService);

  currentPassword = '';
  newPassword = '';
  showCurrent = false;
  showNew = false;
  saving = false;
  error = '';

  get canSave(): boolean {
    return !!this.currentPassword && this.newPassword.length >= MIN_LENGTH;
  }

  save() {
    if (!this.canSave || this.saving) return;
    this.saving = true;
    this.error = '';
    this.profileService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => this.modalController.dismiss(true, 'confirm'),
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.error = errorMessage(err);
      },
    });
  }
}
