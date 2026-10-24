import { Component, computed, effect, inject, untracked } from '@angular/core';
import { AppUpdateService } from './core/app-update.service';
import { AuthService } from './core/auth.service';
import { ProfileService } from './core/profile.service';
import { RestTimeService } from './core/rest-time';
import { WeightUnitService } from './core/weight-unit.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  private authService = inject(AuthService);
  private profileService = inject(ProfileService);
  private units = inject(WeightUnitService);
  private restTime = inject(RestTimeService);
  private updates = inject(AppUpdateService);

  /** While "Update LiftBig" is up, the pages under it can't be reached */
  readonly updateShown = computed(() => this.updates.state() !== 'none');

  constructor() {
    // The weight unit and rest time follow whoever is signed in
    effect(() => {
      const signedIn = this.authService.isAuthenticated();
      untracked(() => {
        if (signedIn) {
          this.profileService.load();
        } else {
          this.units.setUnit('kg');
          this.restTime.set(undefined);
        }
      });
    });
  }
}
