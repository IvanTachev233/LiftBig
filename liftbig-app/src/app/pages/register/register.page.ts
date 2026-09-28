import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, RouterModule],
})
export class RegisterPage {
  private authService = inject(AuthService);
  private toastController = inject(ToastController);

  form = {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'CLIENT' as 'CLIENT' | 'COACH',
  };

  submitting = false;

  get formValid(): boolean {
    return (
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
    this.authService
      .register({
        name: this.form.name.trim(),
        email: this.form.email.trim(),
        password: this.form.password,
        role: this.form.role,
      })
      .subscribe({
        next: () => {
          this.presentToast('Welcome to LiftBig!', 'success');
          this.authService.navigateToDashboard({ replaceUrl: true });
        },
        error: (err) => {
          this.submitting = false;
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
