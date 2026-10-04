import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Exercise } from './workout.service';

export interface ProgramSet {
  id: string;
  programExerciseId?: string;
  reps: number;
  weight: number | null;
  notes: string | null;
  // Set number inside its card
  order: number;
  // Client's result; null until logged
  made: boolean | null;
}

// One exercise card; the same exercise may appear on several cards
export interface ProgramCard {
  id: string;
  programId?: string;
  exerciseId: string;
  exercise?: Exercise;
  // Card position in the program
  order: number;
  // Cards sharing a value form one superset
  supersetGroup: string | null;
  sets: ProgramSet[];
}

export interface Program {
  id: string;
  clientId: string;
  coachId: string;
  name: string;
  scheduledDate: string;
  createdAt: string;
  updatedAt: string;
  // Sorted by card order, sets by set order
  exercises: ProgramCard[];
}

export interface ProgramSetInput {
  reps: number;
  weight?: number | null;
  notes?: string | null;
  order: number;
}

export interface ProgramCardInput {
  exerciseId: string;
  order: number;
  supersetGroup?: string | null;
  sets: ProgramSetInput[];
}

export interface CreateProgramRequest {
  clientId: string;
  name: string;
  scheduledDate: string;
  exercises: ProgramCardInput[];
}

// Sets and cards that keep their id are updated in place, so `made` survives
export interface UpdateProgramSetInput extends ProgramSetInput {
  id?: string;
}

export interface UpdateProgramCardInput {
  id?: string;
  exerciseId: string;
  order: number;
  supersetGroup?: string | null;
  sets: UpdateProgramSetInput[];
}

// `exercises` replaces the cards when present; rows left out are deleted
export interface UpdateProgramRequest {
  name?: string;
  scheduledDate?: string;
  exercises?: UpdateProgramCardInput[];
}

export interface AddProgramSetRequest {
  reps: number;
  weight?: number | null;
  notes?: string | null;
  made?: boolean | null;
}

export interface UpdateProgramSetRequest {
  reps?: number;
  weight?: number | null;
  notes?: string | null;
  made?: boolean | null;
}

@Injectable({
  providedIn: 'root',
})
export class ProgramService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/programs`;

  // Coach methods
  createProgram(body: CreateProgramRequest) {
    return this.http.post<Program>(this.apiUrl, body);
  }

  getClientPrograms(clientId: string) {
    return this.http.get<Program[]>(`${this.apiUrl}/client/${clientId}`);
  }

  updateProgram(id: string, body: UpdateProgramRequest) {
    return this.http.put<Program>(`${this.apiUrl}/${id}`, body);
  }

  deleteProgram(id: string) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Client methods
  getUpcomingPrograms() {
    return this.http.get<Program[]>(`${this.apiUrl}/upcoming`);
  }

  getProgram(id: string) {
    return this.http.get<Program>(`${this.apiUrl}/${id}`);
  }

  // Adds a set to the end of one of the program's cards
  addSet(programId: string, cardId: string, body: AddProgramSetRequest) {
    return this.http.post<ProgramSet>(
      `${this.apiUrl}/${programId}/exercises/${cardId}/sets`,
      body,
    );
  }

  // Logs a result or edits one of the program's sets
  updateSet(programId: string, setId: string, body: UpdateProgramSetRequest) {
    return this.http.patch<ProgramSet>(
      `${this.apiUrl}/${programId}/sets/${setId}`,
      body,
    );
  }
}
