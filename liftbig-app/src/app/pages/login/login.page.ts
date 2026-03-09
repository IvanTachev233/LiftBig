import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
})
export class LoginPage implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastController = inject(ToastController);

  credentials = {
    email: 'ivantachev@liftbig.com',
    password: '***REMOVED***',
  };

  constructor() {}

  ngOnInit() {}

  async presentToast(message: string, color: 'success' | 'danger' = 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }

  private navigateByRole() {
    const user = this.authService.currentUser();
    if (user?.role === 'COACH') {
      this.router.navigate(['/coach/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  login() {
    this.authService.login(this.credentials).subscribe({
      next: () => {
        this.navigateByRole();
      },
      error: (err) => {
        console.error('Login failed', err);
        this.presentToast(
          'Login failed. Please check credentials or ensure backend is running.',
        );
      },
    });
  }

  register() {
    this.authService
      .register({ ...this.credentials, role: 'CLIENT' })
      .subscribe({
        next: () => {
          this.presentToast(
            'Registration successful! Logging in...',
            'success',
          );
          this.login();
        },
        error: (err) => {
          console.error('Registration failed', err);
          this.presentToast(
            'Registration failed. ' + (err.error?.message || 'Check console.'),
          );
        },
      });
  }
}
