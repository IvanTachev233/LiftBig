import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ClientService } from '../../core/client.service';
import { OutboxService } from '../../core/outbox.service';
import { ReadCacheService } from '../../core/read-cache.service';
import { WorkoutCopyService } from '../../core/workout-copy.service';
import { Profile, ProfileService } from '../../core/profile.service';
import { RestTimeService, formatRest } from '../../core/rest-time';
import { ThemeService, ThemeSetting } from '../../core/theme.service';
import { WeightUnit } from '../../core/weight-unit.service';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { ConnectCoachSheetComponent } from './connect-coach-sheet.component';
import { RestTimerSheetComponent } from './rest-timer-sheet.component';
import { EditProfileSheetComponent } from './edit-profile-sheet.component';
import { ChangePasswordSheetComponent } from './change-password-sheet.component';
import { DeleteAccountSheetComponent } from './delete-account-sheet.component';
import { initialsOf } from '../../shared/initials';
import { LargeTitleComponent } from '../../shared/ui/large-title.component';
import { TabHeaderComponent } from '../../shared/ui/tab-header.component';

// Profile for both roles: who you are (editable name), coach connection
// (clients), weight unit, rest timer (clients), theme, My 1RMs (clients),
// change password, log out and delete account
@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TabHeaderComponent, LargeTitleComponent],
})
export class ProfilePage implements ViewWillEnter {
  private profileService = inject(ProfileService);
  private clientService = inject(ClientService);
  private authService = inject(AuthService);
  private toastController = inject(ToastController);
  private alertController = inject(AlertController);
  private outbox = inject(OutboxService);
  private copies = inject(WorkoutCopyService);
  private cache = inject(ReadCacheService);
  private bottomSheet = inject(BottomSheetService);
  private router = inject(Router);
  private restTime = inject(RestTimeService);
  readonly theme = inject(ThemeService);

  profile: Profile | null = null;
  unit: WeightUnit = 'kg';
  user = this.authService.currentUser;
  inviteToken = '';

  get hasCoach(): boolean {
    return !!this.user()?.coachId;
  }

  get isClient(): boolean {
    return this.user()?.role === 'CLIENT';
  }

  /** "2:00", or "Off" for 0 */
  get restLabel(): string {
    const seconds = this.restTime.seconds();
    return seconds ? formatRest(seconds) : 'Off';
  }

  get initials(): string {
    return initialsOf(this.profile?.name, this.profile?.email);
  }

  ionViewWillEnter() {
    this.profileService.getMe().subscribe({
      next: (profile) => {
        this.profile = profile;
        this.unit = profile.weightUnit;
      },
      error: () => this.presentToast("Couldn't load your profile"),
    });
  }

  changeUnit(unit: WeightUnit) {
    if (!this.profile || unit === this.unit) return;
    const previous = this.unit;
    this.unit = unit;
    this.profileService.updateWeightUnit(unit).subscribe({
      error: () => {
        this.unit = previous;
        this.presentToast("Couldn't save the weight unit");
      },
    });
  }

  /** Picks the default rest time in a sheet; a failed save puts the old one back */
  async openRestTimer() {
    const previous = this.restTime.seconds();
    const { data, role } = await this.bottomSheet.open<number>(RestTimerSheetComponent, {
      label: 'Default rest timer',
      props: { seconds: previous },
    });
    if (role !== 'confirm' || data === undefined || data === previous) return;
    this.restTime.set(data);
    this.profileService.updateRestSeconds(data).subscribe({
      error: () => {
        this.restTime.set(previous);
        this.presentToast("Couldn't save the rest timer");
      },
    });
  }

  /** Edits the name in a sheet; a failed save puts the old one back */
  async openEdit() {
    if (!this.profile) return;
    const previous = this.profile.name;
    const { data, role } = await this.bottomSheet.open<string>(EditProfileSheetComponent, {
      label: 'Edit profile',
      props: { name: previous ?? '' },
    });
    if (role !== 'confirm' || !data || !this.profile) return;
    this.profile = { ...this.profile, name: data };
    this.profileService.updateName(data).subscribe({
      next: (profile) => (this.profile = profile),
      error: () => {
        if (this.profile) this.profile = { ...this.profile, name: previous };
        this.presentToast("Couldn't save your name");
      },
    });
  }

  /** The sheet saves the password itself and confirms once it is changed */
  async openChangePassword() {
    const { role } = await this.bottomSheet.open(ChangePasswordSheetComponent, {
      label: 'Change password',
    });
    if (role === 'confirm') this.presentToast('Password changed', 'success');
  }

  changeTheme(setting: ThemeSetting) {
    this.theme.set(setting);
  }

  /** The invite code sheet; the code it returns goes to acceptInvite */
  async openConnect() {
    const { data, role } = await this.bottomSheet.open<string>(ConnectCoachSheetComponent, {
      label: 'Connect a coach',
      props: { code: this.inviteToken },
    });
    if (role !== 'confirm' || !data) return;
    this.inviteToken = data;
    this.acceptInvite();
  }

  openMyMaxes() {
    this.router.navigate(['/history'], { queryParams: { view: 'lifts' } });
  }

  acceptInvite() {
    if (!this.inviteToken) return;
    this.clientService.acceptInvite(this.inviteToken).subscribe({
      next: () => {
        this.presentToast('Invite accepted! You are now linked to your coach.', 'success');
        this.inviteToken = '';
      },
      error: (err) => {
        this.presentToast(err.error?.message || 'Failed to accept invite');
      },
    });
  }

  /** With changes still waiting on this phone, asks first */
  logout() {
    const pending = this.outbox.pendingCount();
    if (pending > 0) {
      void this.confirmLogout(pending);
      return;
    }
    this.authService.logout();
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

  /**
   * The sheet deletes the account itself; then this device forgets what it
   * kept for that account, which can't sign in again, and signs out to Login
   */
  async openDeleteAccount() {
    const { role } = await this.bottomSheet.open(DeleteAccountSheetComponent, {
      label: 'Delete account',
      props: { isCoach: !this.isClient },
    });
    if (role !== 'confirm') return;
    const userId = this.user()?.id;
    if (userId) {
      void this.outbox.forget(userId);
      void this.copies.forget(userId);
      void this.cache.forget(userId);
    }
    this.authService.logout();
    this.presentToast('Account deleted', 'success');
  }

  private async presentToast(message: string, color: 'success' | 'danger' = 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color,
    });
    await toast.present();
  }
}
