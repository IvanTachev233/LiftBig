import { Injectable, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { OutboxService } from '../../core/outbox.service';
import { ReadCacheService } from '../../core/read-cache.service';
import { WorkoutCopyService } from '../../core/workout-copy.service';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { DeleteAccountSheetComponent } from './delete-account-sheet.component';

/**
 * Log out and Delete account, shared by Profile, Privacy and the "We've
 * updated our terms" screen.
 */
@Injectable({ providedIn: 'root' })
export class AccountActionsService {
  private authService = inject(AuthService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private outbox = inject(OutboxService);
  private copies = inject(WorkoutCopyService);
  private cache = inject(ReadCacheService);
  private bottomSheet = inject(BottomSheetService);

  /** With changes still waiting on this phone, asks first */
  logout() {
    const pending = this.outbox.pendingCount();
    if (pending > 0) {
      void this.confirmLogout(pending);
      return;
    }
    this.authService.logout();
  }

  /**
   * The sheet deletes the account itself; then this device forgets what it
   * kept for that account, which can't sign in again, and signs out to Login
   */
  async deleteAccount() {
    const user = this.authService.currentUser();
    const { role } = await this.bottomSheet.open(DeleteAccountSheetComponent, {
      label: 'Delete account',
      props: { isCoach: user?.role === 'COACH' },
    });
    if (role !== 'confirm') return;
    if (user?.id) {
      void this.outbox.forget(user.id);
      void this.copies.forget(user.id);
      void this.cache.forget(user.id);
    }
    this.authService.logout();
    const toast = await this.toastController.create({ message: 'Account deleted', duration: 2500, color: 'success' });
    await toast.present();
  }

  private async confirmLogout(pending: number) {
    const changes = pending === 1 ? "1 change hasn't" : `${pending} changes haven't`;
    const alert = await this.alertController.create({
      message: `${changes} been saved yet. If you log out now they'll be lost.`,
      buttons: [
        { text: 'Stay', role: 'cancel' },
        { text: 'Log out anyway', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'destructive') this.authService.logout();
  }
}
