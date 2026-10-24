import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AgreementStatus, AgreementsService } from './agreements.service';
import { AuthService, User } from './auth.service';
import { RestTimeService } from './rest-time';
import { WeightUnit, WeightUnitService } from './weight-unit.service';

/** The agreement fields are missing from an API that predates them */
export interface Profile extends Partial<AgreementStatus> {
  id: string;
  email: string;
  name: string | null;
  role: User['role'];
  weightUnit: WeightUnit;
  /** Missing from an API that predates the rest timer */
  restSeconds?: number;
}

// The signed-in user's profile; every answer updates the weight unit, the
// rest time and the terms acceptance and consents
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private units = inject(WeightUnitService);
  private restTime = inject(RestTimeService);
  private agreements = inject(AgreementsService);
  private url = `${environment.apiUrl}/users/me`;

  getMe() {
    return this.http.get<Profile>(this.url).pipe(tap((profile) => this.apply(profile)));
  }

  updateWeightUnit(weightUnit: WeightUnit) {
    return this.update({ weightUnit });
  }

  updateRestSeconds(restSeconds: number) {
    return this.update({ restSeconds });
  }

  updateName(name: string) {
    return this.update({ name });
  }

  /**
   * 403 (with attemptsLeft) for a wrong current password, 429 (with
   * retryAfterMinutes) while locked; on success the new token replaces the
   * revoked one, so this device stays signed in
   */
  changePassword(currentPassword: string, newPassword: string) {
    return this.http
      .post<{ access_token: string; refresh_token?: string }>(`${this.url}/password`, {
        currentPassword,
        newPassword,
      })
      .pipe(tap(({ access_token, refresh_token }) => this.auth.setSession(access_token, refresh_token)));
  }

  /**
   * Deletes the account (a coach's is anonymised); 403 and 429 as for
   * changePassword. Signing out is left to the caller
   */
  deleteAccount(password: string) {
    return this.http.delete<void>(this.url, { body: { password } });
  }

  /** Loads the settings in the background; a failure keeps the current ones */
  load() {
    this.getMe().subscribe({ error: () => undefined });
  }

  private update(changes: Partial<Pick<Profile, 'name' | 'weightUnit' | 'restSeconds'>>) {
    return this.http.patch<Profile>(this.url, changes).pipe(tap((profile) => this.apply(profile)));
  }

  private apply(profile: Profile) {
    this.units.setUnit(profile.weightUnit);
    this.restTime.set(profile.restSeconds);
    this.agreements.apply(profile);
  }
}
