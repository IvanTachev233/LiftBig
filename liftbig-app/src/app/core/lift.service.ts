import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { WeightUnit } from './weight-unit.service';

export type LiftRecordSource = 'MANUAL' | 'LOGGED_SET' | 'PROGRAM_SETUP';

// A user's best 1RM on an exercise, in kg
export interface BestLift {
  exerciseId: string;
  weightKg: number;
  unit: WeightUnit;
  achievedOn: string;
  source: LiftRecordSource;
}

export interface RepMaxEntry {
  id: string;
  exerciseId: string;
  reps: number;
  weightKg: number;
  unit: WeightUnit;
  // YYYY-MM-DD
  achievedOn: string;
  source: LiftRecordSource;
  // The logged set it was recorded from, if any
  workoutSetId: string | null;
  createdAt: string;
}

export interface LiftHistory {
  exerciseId: string;
  best: BestLift | null;
  // Rep counts 1, 2 and 3, newest entry each
  latest: { reps: number; entry: RepMaxEntry | null }[];
  // Oldest first
  entries: RepMaxEntry[];
}

export interface RecordResult {
  entry: RepMaxEntry;
  best: BestLift | null;
}

@Injectable({ providedIn: 'root' })
export class LiftService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/lifts`;

  getBests(exerciseIds: string[]) {
    const params = new HttpParams().set('exerciseIds', exerciseIds.join(','));
    return this.http.get<BestLift[]>(`${this.url}/best`, { params });
  }

  getHistory(exerciseId: string) {
    return this.http.get<LiftHistory>(`${this.url}/${exerciseId}/history`);
  }

  // 1-3 reps, kg
  recordManual(body: {
    exerciseId: string;
    reps: number;
    weightKg: number;
    achievedOn: string;
  }) {
    return this.http.post<RecordResult>(`${this.url}/rep-maxes`, body);
  }

  // Hides an own entry from history and bests; 404 when it is not found
  removeRepMax(id: string) {
    return this.http.delete<unknown>(`${this.url}/rep-maxes/${id}`);
  }
}
