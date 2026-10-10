import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { ClientService } from '../../core/client.service';
import { Profile, ProfileService } from '../../core/profile.service';
import { ThemeService, ThemeSetting } from '../../core/theme.service';
import { WeightUnit } from '../../core/weight-unit.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ProfilePage implements ViewWillEnter {
  private profileService = inject(ProfileService);
  private clientService = inject(ClientService);
  private authService = inject(AuthService);
  private toastController = inject(ToastController);
  readonly theme = inject(ThemeService);

  profile: Profile | null = null;
  unit: WeightUnit = 'kg';
  user = this.authService.currentUser;
  inviteToken = '';

  get hasCoach(): boolean {
    return !!this.user()?.coachId;
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
