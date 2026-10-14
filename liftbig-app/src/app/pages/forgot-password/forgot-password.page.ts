import { Component, OnDestroy, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { Countdown, RESEND_COOLDOWN_SECONDS, emailCodeError, retryAfter, waitLabel } from '../../core/email-code';
import { CODE_LENGTH, CodeFieldComponent } from '../../shared/ui/code-field.component';

const MIN_PASSWORD_LENGTH = 6;

/** The message for a failed reset: a too-short password, else as for any code */
function resetError(err: HttpErrorResponse): string {
  const body = (err.error ?? {}) as {
    attemptsLeft?: unknown;
    message?: unknown;
  };
  if (err.status === 400 && typeof body.attemptsLeft !== 'number' && /newPassword/.test(String(body.message))) {
    return 'Your new password needs at least 6 characters.';
  }
  return emailCodeError(err);
}

// Reset password: the email (prefilled from ?email=) gets a mailed code, then
// the code and a new password set it; Login follows with the email filled in
@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  standalone: true,
  imports: [IonicModule, FormsModule, CodeFieldComponent],
})
export class ForgotPasswordPage implements OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly step = signal<'email' | 'reset'>('email');
  readonly code = signal('');
  readonly cooldown = new Countdown();
  readonly waitLabel = waitLabel;

  email = this.route.snapshot.queryParamMap.get('email') ?? '';
  // The address the code went to
  sentTo = '';
  newPassword = '';
  showPassword = false;
  busy = false;
  error = '';
  notice = '';

  get emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  get canReset(): boolean {
    return this.code().length === CODE_LENGTH && this.newPassword.length >= MIN_PASSWORD_LENGTH;
  }

  ngOnDestroy() {
    this.cooldown.stop();
  }

  sendCode() {
    if (!this.emailValid || this.busy) return;
    const email = this.email.trim();
    this.busy = true;
    this.error = '';
    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.busy = false;
        this.sentTo = email;
        this.notice = '';
        this.step.set('reset');
        this.cooldown.start(RESEND_COOLDOWN_SECONDS);
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        this.error = err.status === 400 ? 'Enter a valid email address.' : emailCodeError(err);
      },
    });
  }

  reset() {
    if (!this.canReset || this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.authService.resetPassword(this.sentTo, this.code(), this.newPassword).subscribe({
      next: () => {
        this.busy = false;
        this.router.navigate(['/login'], {
          queryParams: { email: this.sentTo, passwordReset: 1 },
          replaceUrl: true,
        });
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        this.error = resetError(err);
      },
    });
  }

  resend() {
    if (this.cooldown.remaining() > 0 || this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.authService.forgotPassword(this.sentTo).subscribe({
      next: () => {
        this.busy = false;
        this.notice = `If ${this.sentTo} has an account, a new code is on its way.`;
        this.cooldown.start(RESEND_COOLDOWN_SECONDS);
      },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        this.error = emailCodeError(err);
        if (err.status === 429) this.cooldown.start(retryAfter(err));
      },
    });
  }

  useDifferentEmail() {
    this.cooldown.stop();
    this.step.set('email');
    this.code.set('');
    this.newPassword = '';
    this.showPassword = false;
    this.error = '';
    this.notice = '';
  }
}
