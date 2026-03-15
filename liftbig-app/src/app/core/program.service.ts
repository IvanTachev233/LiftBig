import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ProgramExercise {
  id: string;
  exerciseId: string;
  exercise: {
    id: string;
    name: string;
    bodyPart: string;
  };
  reps: number;
  weight: number | null;
  notes: string | null;
  order: number;
  made: boolean | null;
}

export interface Program {
  id: string;
  clientId: string;
  coachId: string;
  name: string;
  scheduledDate: string;
  createdAt: string;
  updatedAt: string;
  exercises: ProgramExercise[];
}

@Injectable({
  providedIn: 'root',
})
export class ProgramService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/programs`;

  // Coach methods
  createProgram(data: any) {
    return this.http.post<Program>(this.apiUrl, data);
  }

  getClientPrograms(clientId: string) {
    return this.http.get<Program[]>(`${this.apiUrl}/client/${clientId}`);
  }

  updateProgram(id: string, data: any) {
    return this.http.put<Program>(`${this.apiUrl}/${id}`, data);
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

  patchExercise(programId: string, exerciseId: string, data: any) {
    return this.http.patch<ProgramExercise>(
      `${this.apiUrl}/${programId}/exercises/${exerciseId}`,
      data,
    );
  }

  addExerciseSet(programId: string, data: { exerciseId: string; reps: number; weight?: number | null; notes?: string | null; made?: boolean | null }) {
    return this.http.post<ProgramExercise>(
      `${this.apiUrl}/${programId}/exercises`,
      data,
    );
  }
}
