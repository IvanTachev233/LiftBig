import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { Profile, ProfileService } from '../../core/profile.service';
import { WeightUnit } from '../../core/weight-unit.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class ProfilePage implements ViewWillEnter {
  private profileService = inject(ProfileService);
  private toastController = inject(ToastController);

  profile: Profile | null = null;
  unit: WeightUnit = 'kg';

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

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
