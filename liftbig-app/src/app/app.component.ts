import { Component, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
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
  private router = inject(Router);
  private profileService = inject(ProfileService);
  private units = inject(WeightUnitService);

  dashboardUrl = this.authService.dashboardUrl;
  user = this.authService.currentUser;

  constructor() {
    // The weight unit follows whoever is signed in
    effect(() => {
      const signedIn = this.authService.isAuthenticated();
      untracked(() =>
        signedIn ? this.profileService.load() : this.units.setUnit('kg'),
      );
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
