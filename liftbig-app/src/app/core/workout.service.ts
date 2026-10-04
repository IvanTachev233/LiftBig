import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type WorkoutStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

export interface WorkoutSet {
  id: string;
  workoutExerciseId?: string;
  reps: number;
  weight: number;
  // Set number inside its card
  order: number;
  isCompleted: boolean;
  weightMode?: 'EX' | 'PC' | 'RP';
  expectedWeight?: number | null;
  actualReps?: number | null;
  actualWeight?: number | null;
}

// One exercise card; the same exercise may appear on several cards
export interface WorkoutCard {
  id: string;
  workoutId?: string;
  exerciseId: string;
  exercise?: Exercise;
  // Card position in the workout
  order: number;
  // Cards sharing a value form one superset
  supersetGroup: string | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  userId?: string;
  name: string;
  date: string;
  notes?: string | null;
  isTemplate?: boolean;
  status: WorkoutStatus;
  totalWeightLifted: number;
  // Sorted by card order, sets by set order
  exercises: WorkoutCard[];
}

export interface CreateWorkoutRequest {
  name: string;
  date: string;
  notes?: string;
  isTemplate?: boolean;
}

// `id` keeps an existing set of the same card; omit it for a new set
export interface WorkoutSetInput {
  id?: string;
  reps: number;
  weight: number;
  order?: number;
  isCompleted?: boolean;
}

// `id` keeps an existing card of the same workout; omit it for a new card
export interface WorkoutCardInput {
  id?: string;
  exerciseId: string;
  order: number;
  supersetGroup?: string | null;
  sets: WorkoutSetInput[];
}

// `exercises` replaces all cards when present and leaves them as they are when absent
export interface UpdateWorkoutRequest {
  name?: string;
  notes?: string;
  status?: WorkoutStatus;
  date?: string;
  exercises?: WorkoutCardInput[];
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
    return this.http.get<Workout>(`${this.apiUrl}/${id}`);
  }

  createWorkout(workout: CreateWorkoutRequest) {
    return this.http.post<Workout>(this.apiUrl, workout);
  }

  updateWorkout(id: string, body: UpdateWorkoutRequest) {
    return this.http.patch<Workout>(`${this.apiUrl}/${id}`, body);
  }

  deleteWorkout(id: string) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
