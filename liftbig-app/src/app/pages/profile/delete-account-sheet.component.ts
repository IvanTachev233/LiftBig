import { Component, Input, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline, trashOutline } from 'ionicons/icons';
import { ProfileService } from '../../core/profile.service';
import { passwordErrorMessage } from './password-errors';

const CLIENT_MESSAGE =
  'This permanently deletes your account, your workouts and logged sets, ' +
  "your 1RMs and your programs. This can't be undone.";
const COACH_MESSAGE =
  'This permanently deletes your account, your invites and your own workouts. ' +
  "Your clients keep their workouts and are unlinked from you. This can't be undone.";

/**
 * Confirm sheet that deletes the account itself once the password is
 * entered, so a wrong password keeps it open with an error; confirms with
 * true once the API accepts.
 */
@Component({
  selector: 'app-delete-account-sheet',
  template: `
    <div class="confirm-sheet">
      <div class="confirm-head">
        <span class="danger-circle" aria-hidden="true"><ion-icon name="trash-outline"></ion-icon></span>
        <div class="confirm-text">
          <h2 class="confirm-title">Delete account?</h2>
          <p class="confirm-message">{{ message }}</p>
        </div>
      </div>
      <ion-input
        class="input-field password-input"
        label="Password"
        labelPlacement="stacked"
        autocomplete="current-password"
        [type]="showPassword ? 'text' : 'password'"
        [(ngModel)]="password"
      >
        <button
          slot="end"
          type="button"
          class="password-toggle"
          [attr.aria-pressed]="showPassword"
          [attr.aria-label]="(showPassword ? 'Hide' : 'Show') + ' password'"
          (click)="showPassword = !showPassword"
        >
          <ion-icon [name]="showPassword ? 'eye-off-outline' : 'eye-outline'" aria-hidden="true"></ion-icon>
        </button>
      </ion-input>
      @if (error) {
        <p class="sheet-error" role="alert">{{ error }}</p>
      }
      <div class="confirm-actions">
        <button type="button" class="confirm-btn" [disabled]="!password || deleting" (click)="delete()">
          Delete account
        </button>
        <button type="button" class="cancel-btn" (click)="cancel()">Cancel</button>
      </div>
    </div>
  `,
  styles: `
    .sheet-error {
      margin: -6px 0 0;
      color: var(--danger-text);
      font-size: 13px;
    }

    .confirm-btn:disabled {
      opacity: 0.45;
      cursor: default;
    }
  `,
  standalone: true,
  imports: [IonicModule, FormsModule],
})
export class DeleteAccountSheetComponent {
  private modalController = inject(ModalController);
  private profileService = inject(ProfileService);

  @Input() isCoach = false;

  password = '';
  showPassword = false;
  deleting = false;
  error = '';

  constructor() {
    addIcons({ eyeOffOutline, eyeOutline, trashOutline });
  }

  get message(): string {
    return this.isCoach ? COACH_MESSAGE : CLIENT_MESSAGE;
  }

  delete() {
    if (!this.password || this.deleting) return;
    this.deleting = true;
    this.error = '';
    this.profileService.deleteAccount(this.password).subscribe({
      next: () => this.modalController.dismiss(true, 'confirm'),
      error: (err: HttpErrorResponse) => {
        this.deleting = false;
        this.error = passwordErrorMessage(
          err,
          'Your password is incorrect.',
          "Couldn't delete your account. Try again.",
        );
      },
    });
  }

  cancel() {
    this.modalController.dismiss(false, 'cancel');
  }
}
