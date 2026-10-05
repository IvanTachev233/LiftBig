import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export type WorkoutStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

export interface WorkoutSet {
  id: string;
  workoutExerciseId?: string;
  // Planned reps and weight
  reps: number;
  weight: number | null;
  // Set number inside its card
  order: number;
  // true = made, false = missed, null = not logged
  made: boolean | null;
  // Logged values; null means "as planned" once the set is logged
  actualReps: number | null;
  actualWeight: number | null;
  notes: string | null;
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
  // The coach who assigned the workout; null for a self-made one
  assignedById: string | null;
  assignedBy: { id: string; name: string | null } | null;
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
  weight: number | null;
  order?: number;
  made?: boolean | null;
  actualReps?: number | null;
  actualWeight?: number | null;
}

// `id` keeps an existing card of the same workout; omit it for a new card
export interface WorkoutCardInput {
  id?: string;
  exerciseId: string;
  order: number;
  supersetGroup?: string | null;
  sets: WorkoutSetInput[];
}

// `exercises` is the full card list when present: kept rows carry their id and
// keep any result left out, rows left out are deleted. Absent = cards unchanged.
// An assigned workout accepts `status` only.
export interface UpdateWorkoutRequest {
  name?: string;
  notes?: string;
  status?: WorkoutStatus;
  date?: string;
  exercises?: WorkoutCardInput[];
}

// Appends a set to a card of an own workout, self-made or assigned
export interface AddSetRequest {
  reps: number;
  weight?: number | null;
  made?: boolean | null;
  actualReps?: number | null;
  actualWeight?: number | null;
}

// Result of one set; planned values can't be changed this way
export interface SetResultRequest {
  made?: boolean | null;
  actualReps?: number | null;
  actualWeight?: number | null;
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

  addSet(workoutId: string, cardId: string, body: AddSetRequest) {
    return this.http.post<WorkoutSet>(
      `${this.apiUrl}/${workoutId}/cards/${cardId}/sets`,
      body,
    );
  }

  // Sends only the result fields, so a passed-in set can't carry planned values
  updateSetResult(workoutId: string, setId: string, body: SetResultRequest) {
    const result: SetResultRequest = {};
    if (body.made !== undefined) result.made = body.made;
    if (body.actualReps !== undefined) result.actualReps = body.actualReps;
    if (body.actualWeight !== undefined) result.actualWeight = body.actualWeight;
    return this.http.patch<WorkoutSet>(
      `${this.apiUrl}/${workoutId}/sets/${setId}`,
      result,
    );
  }
}
