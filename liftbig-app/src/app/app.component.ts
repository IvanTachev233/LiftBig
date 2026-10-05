import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  dashboardUrl = this.authService.dashboardUrl;

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
