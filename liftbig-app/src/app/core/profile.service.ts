import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { User } from './auth.service';
import { RestTimeService } from './rest-time';
import { WeightUnit, WeightUnitService } from './weight-unit.service';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: User['role'];
  weightUnit: WeightUnit;
  /** Missing from an API that predates the rest timer */
  restSeconds?: number;
}

// The signed-in user's profile; every answer updates the weight unit and
// the rest time
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);
  private units = inject(WeightUnitService);
  private restTime = inject(RestTimeService);
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

  /** Loads the settings in the background; a failure keeps the current ones */
  load() {
    this.getMe().subscribe({ error: () => undefined });
  }

  private update(changes: Partial<Pick<Profile, 'weightUnit' | 'restSeconds'>>) {
    return this.http.patch<Profile>(this.url, changes).pipe(tap((profile) => this.apply(profile)));
  }

  private apply(profile: Profile) {
    this.units.setUnit(profile.weightUnit);
    this.restTime.set(profile.restSeconds);
  }
}
