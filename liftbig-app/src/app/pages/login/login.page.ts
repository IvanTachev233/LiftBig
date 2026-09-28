import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/auth.service';

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

  credentials = {
    email: '',
    password: '',
  };

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
        error: (err) => {
          console.error('Login failed', err);
          this.presentToast('Login failed. Please check your credentials.');
        },
      });
  }
}
