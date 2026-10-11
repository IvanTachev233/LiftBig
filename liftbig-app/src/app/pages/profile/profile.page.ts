import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ClientService } from '../../core/client.service';
import { Profile, ProfileService } from '../../core/profile.service';
import { ThemeService, ThemeSetting } from '../../core/theme.service';
import { WeightUnit } from '../../core/weight-unit.service';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { ConnectCoachSheetComponent } from './connect-coach-sheet.component';
import { LargeTitleComponent } from '../../shared/ui/large-title.component';
import { TabHeaderComponent } from '../../shared/ui/tab-header.component';

// Profile for both roles: who you are, coach connection (clients), weight
// unit, theme, My 1RMs (clients) and log out
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
  private bottomSheet = inject(BottomSheetService);
  private router = inject(Router);
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

  /** "AR" for Alex Rivera; the email's first letter without a name */
  get initials(): string {
    const words = (this.profile?.name ?? '').trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
    const initials = letters.map((w) => w[0]).join('');
    return (initials || this.profile?.email?.[0] || '?').toUpperCase();
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

  logout() {
    this.authService.logout();
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
