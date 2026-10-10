import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { User } from './auth.service';
import { WeightUnit, WeightUnitService } from './weight-unit.service';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: User['role'];
  weightUnit: WeightUnit;
}

// The signed-in user's profile; every answer updates the weight unit.
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);
  private units = inject(WeightUnitService);
  private url = `${environment.apiUrl}/users/me`;

  getMe() {
    return this.http
      .get<Profile>(this.url)
      .pipe(tap((profile) => this.units.setUnit(profile.weightUnit)));
  }

  updateWeightUnit(weightUnit: WeightUnit) {
    return this.http
      .patch<Profile>(this.url, { weightUnit })
      .pipe(tap((profile) => this.units.setUnit(profile.weightUnit)));
  }

  /** Loads the unit in the background; a failure keeps the current one */
  load() {
    this.getMe().subscribe({ error: () => undefined });
  }
}
