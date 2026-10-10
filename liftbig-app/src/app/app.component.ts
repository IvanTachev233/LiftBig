import { Component, effect, inject, untracked } from '@angular/core';
import { AuthService } from './core/auth.service';
import { ProfileService } from './core/profile.service';
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

  constructor() {
    // The weight unit follows whoever is signed in
    effect(() => {
      const signedIn = this.authService.isAuthenticated();
      untracked(() =>
        signedIn ? this.profileService.load() : this.units.setUnit('kg'),
      );
    });
  }
}
