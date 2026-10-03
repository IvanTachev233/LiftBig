import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { toSignal } from '@angular/core/rxjs-interop'; // Needs Angular 16+
// Assuming Angular 17/18/20 based on user request "Angular v20"

export interface Workout {
  id: string;
  name: string;
  date: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  totalWeightLifted: number;
}

export interface Exercise {
  id: string;
  name: string;
  description?: string | null;
  bodyPart?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  // null = global (seeded) exercise; otherwise the coach who created it
  createdById?: string | null;
}

export interface CreateExerciseDto {
  name: string;
  description?: string;
  videoUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class WorkoutService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/workouts`;

  // Signals
  // In a real app we might want manually manageable signals or resources,
  // but toSignal is great for read-only streams
  // We'll stick to simple methods returning Observables or Signals as needed.

  getUpcoming() {
    return this.http.get<Workout[]>(`${this.apiUrl}/upcoming`);
  }

  getExercises() {
    return this.http.get<Exercise[]>(`${this.apiUrl}/exercises`);
  }

  // COACH only; the API returns 409 when the name is already taken
  createExercise(dto: CreateExerciseDto) {
    return this.http.post<Exercise>(`${this.apiUrl}/exercises`, dto);
  }

  getAllWorkouts() {
    return this.http.get<Workout[]>(this.apiUrl);
  }

  getWorkout(id: string) {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  createWorkout(workout: any) {
    return this.http.post(this.apiUrl, workout);
  }

  updateWorkout(id: string, data: any) {
    return this.http.patch(`${this.apiUrl}/${id}`, data);
  }

  deleteWorkout(id: string) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
