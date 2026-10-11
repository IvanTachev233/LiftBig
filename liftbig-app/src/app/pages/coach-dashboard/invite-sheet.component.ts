import { Component, Input, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { copyOutline } from 'ionicons/icons';
import { ClientService, Invite } from '../../core/client.service';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';

// Loose check before sending; the API validates the address
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite a client: an email field and Send invite, then the code to share
 * with a Copy button. Opened with `invite`, it shows that pending invite's
 * code. No email is sent; the client joins with the code.
 */
@Component({
  selector: 'app-invite-sheet',
  template: `
    @if (shownInvite; as invite) {
      <app-bottom-sheet
        [title]="createdInvite ? 'Invite created' : 'Invite code'"
        [helper]="
          'Share this code with ' + invite.clientEmail + '. They enter it on their Profile. Expires ' +
          (invite.expiresAt | date: 'EEE d MMM') + '.'
        "
        primaryLabel="Done"
        (primary)="close()"
      >
        <div class="invite-code">
          <span class="code-label" id="invite-code-label">Invite code</span>
          <span class="code-value num" aria-labelledby="invite-code-label">{{ invite.token }}</span>
        </div>
        <ion-button class="btn-secondary copy-btn" expand="block" (click)="copy(invite.token)">
          <ion-icon name="copy-outline" slot="start" aria-hidden="true"></ion-icon>
          <span aria-live="polite">{{ copied ? 'Copied' : 'Copy code' }}</span>
        </ion-button>
      </app-bottom-sheet>
    } @else {
      <app-bottom-sheet
        title="Invite a client"
        helper="You'll get an invite code to share. No email is sent; your client joins with the code."
        primaryLabel="Send invite"
        [primaryDisabled]="!valid || sending"
        (primary)="send()"
      >
        <ion-input
          class="input-field invite-email"
          label="Client email"
          labelPlacement="stacked"
          type="email"
          inputmode="email"
          autocapitalize="off"
          autocomplete="off"
          placeholder="client@example.com"
          [value]="email"
          (ionInput)="email = $any($event).detail.value ?? ''"
          (keyup.enter)="send()"
        ></ion-input>
      </app-bottom-sheet>
    }
  `,
  styles: `
    .invite-code {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 16px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-md);
      background: var(--surface-input);
    }
    .code-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-soft);
    }
    .code-value {
      font-size: 20px;
      font-weight: 600;
      overflow-wrap: anywhere;
      user-select: all;
    }
  `,
  standalone: true,
  imports: [IonicModule, DatePipe, BottomSheetComponent],
})
export class InviteSheetComponent {
  private clientService = inject(ClientService);
  private modalController = inject(ModalController);
  private toastController = inject(ToastController);

  /** A pending invite to show instead of the form */
  @Input() invite?: Invite;
  /** Called once the API has created the invite */
  @Input() created?: (invite: Invite) => void;

  email = '';
  sending = false;
  copied = false;
  createdInvite: Invite | null = null;

  constructor() {
    addIcons({ copyOutline });
  }

  get shownInvite(): Invite | null {
    return this.createdInvite ?? this.invite ?? null;
  }

  get valid(): boolean {
    return EMAIL.test(this.email.trim());
  }

  /** Creates the invite; an error keeps the sheet open with a toast */
  send() {
    if (!this.valid || this.sending) return;
    this.sending = true;
    this.clientService.sendInvite(this.email.trim()).subscribe({
      next: (invite) => {
        this.sending = false;
        this.createdInvite = invite;
        this.created?.(invite);
      },
      error: (err) => {
        this.sending = false;
        this.presentToast(err.error?.message || 'Failed to send invite');
      },
    });
  }

  async copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      this.copied = true;
    } catch {
      this.presentToast("Couldn't copy the code. Select it to copy it.");
    }
  }

  close() {
    this.modalController.dismiss(this.shownInvite, 'confirm');
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'top',
    });
    await toast.present();
  }
}
