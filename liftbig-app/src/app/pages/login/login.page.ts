import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/auth.service';

// Log in: wordmark, email and password (with a show toggle and "Forgot
// password?"), link to sign up. ?email= fills in the email; ?passwordReset=1
// adds the reset message.
@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, RouterModule],
})
export class LoginPage {
  private authService = inject(AuthService);
  private toastController = inject(ToastController);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  credentials = {
    email: '',
    password: '',
  };
  showPassword = false;
  notice = '';

  constructor() {
    // A subscription, as the Ionic outlet may reuse this page with new params
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const email = params.get('email');
      if (email) this.credentials.email = email;
      if (params.get('passwordReset')) {
        this.credentials.password = '';
        this.notice = 'Password reset. Log in with your new password.';
      }
    });
  }

  /** Carries the typed email over to Reset password */
  get forgotParams(): { email?: string } {
    const email = this.credentials.email.trim();
    return email ? { email } : {};
  }

  async presentToast(message: string, color: 'success' | 'danger' = 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }

  login() {
    const email = this.credentials.email.trim();
    if (!email || !this.credentials.password) {
      return;
    }
    this.authService
      .login({ email, password: this.credentials.password })
      .subscribe({
        next: () => {
          this.authService.navigateToDashboard({ replaceUrl: true });
        },
        error: (err: HttpErrorResponse) => {
          // Right password, email not confirmed yet: a new code was mailed
          if (err.status === 403 && err.error?.code === 'EMAIL_NOT_VERIFIED') {
            this.router.navigate(['/verify-email'], { queryParams: { email } });
            return;
          }
          console.error('Login failed', err);
          this.presentToast('Login failed. Please check your credentials.');
        },
      });
  }
}
