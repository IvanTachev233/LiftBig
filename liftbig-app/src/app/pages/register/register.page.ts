import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { switchMap } from 'rxjs';
import { AgreementChoices, AgreementsService, NO_CHOICES, isOutdated } from '../../core/agreements.service';
import { AuthService } from '../../core/auth.service';
import { AgreementChecksComponent } from '../../shared/ui/agreement-checks.component';

// Sign up: name, email, password twice (one show toggle), Client/Coach, the
// Terms and training data boxes and the optional consents; then Check your
// email
@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, RouterModule, AgreementChecksComponent],
})
export class RegisterPage {
  private authService = inject(AuthService);
  private toastController = inject(ToastController);
  private router = inject(Router);
  private agreements = inject(AgreementsService);

  form = {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'CLIENT' as 'CLIENT' | 'COACH',
  };

  /** Both required boxes start unticked and the optional consents off */
  readonly choices = signal<AgreementChoices>(NO_CHOICES);
  readonly optionalPurposes = ['video_training', 'product_emails'] as const;

  submitting = false;
  showPassword = false;

  get agreed(): boolean {
    return this.choices().terms && this.choices().health_data;
  }

  get formValid(): boolean {
    return (
      this.agreed &&
      this.form.name.trim().length > 0 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email) &&
      this.form.password.length >= 6 &&
      this.form.password === this.form.confirmPassword
    );
  }

  get passwordMismatch(): boolean {
    return (
      this.form.confirmPassword.length > 0 &&
      this.form.password !== this.form.confirmPassword
    );
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

  register() {
    if (!this.formValid || this.submitting) {
      return;
    }
    this.submitting = true;
    const { video_training, product_emails } = this.choices();
    this.agreements
      .signUpAgreement({ video_training, product_emails })
      .pipe(
        switchMap((agreement) =>
          this.authService.register({
            name: this.form.name.trim(),
            email: this.form.email.trim(),
            password: this.form.password,
            role: this.form.role,
            ...agreement,
          }),
        ),
      )
      .subscribe({
        next: ({ email }) => {
          this.submitting = false;
          this.router.navigate(['/verify-email'], { queryParams: { email } });
        },
        error: (err) => {
          this.submitting = false;
          // The versions may have changed; the next try fetches them again
          if (isOutdated(err)) this.agreements.forgetPolicies();
          console.error('Registration failed', err);
          // Validation errors arrive as an array of messages
          const message = err.error?.message;
          this.presentToast(
            (Array.isArray(message) ? message.join('\n') : message) ||
              'Registration failed. Please try again.',
          );
        },
      });
  }
}
