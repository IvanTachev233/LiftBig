import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { Countdown, RESEND_COOLDOWN_SECONDS, emailCodeError, retryAfter, waitLabel } from '../../core/email-code';
import { CODE_LENGTH, CodeFieldComponent } from '../../shared/ui/code-field.component';

// Check your email: the code mailed at sign-up (or on a login before the
// email was confirmed) signs in; the address comes from ?email=
@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.page.html',
  styleUrls: ['./verify-email.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CodeFieldComponent],
})
export class VerifyEmailPage implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastController = inject(ToastController);

  readonly email = this.route.snapshot.queryParamMap.get('email') ?? '';
  readonly code = signal('');
  readonly cooldown = new Countdown();
  readonly waitLabel = waitLabel;

  submitting = false;
  resending = false;
  error = '';
  notice = '';

  ngOnInit() {
    if (!this.email) {
      this.router.navigate(['/register'], { replaceUrl: true });
      return;
    }
    // Every way here has just sent a code (or hit the limit)
    this.cooldown.start(RESEND_COOLDOWN_SECONDS);
  }

  ngOnDestroy() {
    this.cooldown.stop();
  }

  verify() {
    if (this.code().length !== CODE_LENGTH || this.submitting) return;
    this.submitting = true;
    this.error = '';
    this.notice = '';
    this.authService.verifyEmail(this.email, this.code()).subscribe({
      next: async () => {
        await this.authService.navigateToDashboard({ replaceUrl: true });
        const toast = await this.toastController.create({
          message: 'Welcome to LiftBig!',
          duration: 3000,
          color: 'success',
          position: 'top',
        });
        await toast.present();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting = false;
        this.error = emailCodeError(err);
      },
    });
  }

  resend() {
    if (this.cooldown.remaining() > 0 || this.resending) return;
    this.resending = true;
    this.error = '';
    this.notice = '';
    this.authService.resendVerification(this.email).subscribe({
      next: () => {
        this.resending = false;
        this.notice = `We sent a new code to ${this.email}.`;
        this.cooldown.start(RESEND_COOLDOWN_SECONDS);
      },
      error: (err: HttpErrorResponse) => {
        this.resending = false;
        this.error = emailCodeError(err);
        if (err.status === 429) this.cooldown.start(retryAfter(err));
      },
    });
  }

  useDifferentEmail() {
    this.router.navigate(['/register']);
  }
}
