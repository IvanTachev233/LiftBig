import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Workout } from './workout.service';

// One planned set; `id` keeps an existing set of the workout
export interface CoachSetInput {
  id?: string;
  reps: number;
  weight?: number | null;
  notes?: string | null;
  order?: number;
}

// One planned card; `id` keeps an existing card of the workout
export interface CoachCardInput {
  id?: string;
  exerciseId: string;
  order: number;
  supersetGroup?: string | null;
  sets: CoachSetInput[];
}

export interface CreateCoachWorkoutRequest {
  name: string;
  date: string;
  notes?: string;
  exercises: CoachCardInput[];
}

// `exercises` is the full plan when present; kept rows carry their id so the
// client's results survive, rows left out are deleted
export interface UpdateCoachWorkoutRequest {
  name?: string;
  date?: string;
  notes?: string;
  exercises?: CoachCardInput[];
}

// Keeps only the planned fields, dropping results and relations
function plannedCards(cards: CoachCardInput[]): CoachCardInput[] {
  return cards.map((card) => ({
    ...(card.id ? { id: card.id } : {}),
    exerciseId: card.exerciseId,
    order: card.order,
    supersetGroup: card.supersetGroup ?? null,
    sets: card.sets.map((set) => ({
      ...(set.id ? { id: set.id } : {}),
      reps: set.reps,
      weight: set.weight ?? null,
      notes: set.notes ?? null,
      ...(set.order !== undefined ? { order: set.order } : {}),
    })),
  }));
}

// Workouts a coach assigns to their clients
@Injectable({
  providedIn: 'root',
})
export class CoachWorkoutService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/coach`;

  getClientWorkouts(clientId: string) {
    return this.http.get<Workout[]>(
      `${this.apiUrl}/clients/${clientId}/workouts`,
    );
  }

  createWorkout(clientId: string, body: CreateCoachWorkoutRequest) {
    return this.http.post<Workout>(
      `${this.apiUrl}/clients/${clientId}/workouts`,
      { ...body, exercises: plannedCards(body.exercises) },
    );
  }

  getWorkout(id: string) {
    return this.http.get<Workout>(`${this.apiUrl}/workouts/${id}`);
  }

  updateWorkout(id: string, body: UpdateCoachWorkoutRequest) {
    const { exercises, ...fields } = body;
    return this.http.put<Workout>(
      `${this.apiUrl}/workouts/${id}`,
      exercises ? { ...fields, exercises: plannedCards(exercises) } : fields,
    );
  }

  deleteWorkout(id: string) {
    return this.http.delete(`${this.apiUrl}/workouts/${id}`);
  }
}
