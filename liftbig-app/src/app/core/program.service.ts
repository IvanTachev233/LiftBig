import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Workout } from './workout.service';

export interface RequiredLift {
  exerciseId: string;
  exerciseName: string;
  // The sport's own name for the lift, e.g. "Squat"
  label: string;
  displayOrder: number;
}

export interface Sport {
  id: string;
  name: string;
  displayOrder: number;
  requiredLifts: RequiredLift[];
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  authorName: string;
  durationWeeks: number;
  sessionsPerWeek: number;
}

export interface ProgramExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  order: number;
  sets: number;
  reps: number;
  // Percent of the 1RM of the reference lift; both null for a fixed weight
  percentOf1RM: number | null;
  referenceExerciseId: string | null;
  referenceLabel: string | null;
  notes: string | null;
}

export interface ProgramSession {
  id: string;
  week: number;
  sessionIndex: number;
  // Days after the start of its week
  dayOffset: number;
  title: string;
  notes: string | null;
  exercises: ProgramExercise[];
}

// A lift the program takes percentages of, with the sport's label
export interface ReferenceLift {
  exerciseId: string;
  label: string;
}

export interface ProgramDetail extends ProgramSummary {
  version: number;
  sport: { id: string; name: string };
  referenceLifts: ReferenceLift[];
  sessions: ProgramSession[];
}

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  // Local calendar date, YYYY-MM-DD
  startDate: string;
  programId: string;
  programVersion: number;
  // kg by exercise id
  maxesSnapshot: Record<string, number>;
  createdAt: string;
  program: {
    id: string;
    name: string;
    sportId: string;
    durationWeeks: number;
    sessionsPerWeek: number;
  };
  // The program's workouts by date
  workouts: Workout[];
}

// A 1RM in kg
export interface MaxInput {
  exerciseId: string;
  weightKg: number;
}

export interface EnrollRequest {
  programId: string;
  startDate: string;
  maxes: MaxInput[];
  abandonCurrent?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A program workout's week from the start date and its place in that week, both from 1 */
export function sessionPosition(
  enrollment: Pick<Enrollment, 'startDate' | 'workouts'>,
  workoutId: string,
): { week: number; day: number } | null {
  const start = Date.parse(enrollment.startDate);
  const weekOf = (workout: Workout) =>
    Math.floor(Math.round((Date.parse(workout.date.slice(0, 10)) - start) / DAY_MS) / 7) + 1;
  const workout = enrollment.workouts.find((w) => w.id === workoutId);
  if (!workout) return null;
  const week = weekOf(workout);
  const day =
    enrollment.workouts
      .filter((w) => weekOf(w) === week)
      .map((w) => w.date.slice(0, 10))
      .sort()
      .indexOf(workout.date.slice(0, 10)) + 1;
  return { week, day };
}

@Injectable({ providedIn: 'root' })
export class ProgramService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  getSports() {
    return this.http.get<Sport[]>(`${this.api}/sports`);
  }

  // PUBLISHED programs only
  getPrograms(sportId: string) {
    return this.http.get<ProgramSummary[]>(`${this.api}/sports/${sportId}/programs`);
  }

  getProgram(id: string) {
    return this.http.get<ProgramDetail>(`${this.api}/programs/${id}`);
  }

  // 409 while another program is active, unless abandonCurrent is set
  enroll(body: EnrollRequest) {
    return this.http.post<Enrollment>(`${this.api}/program-enrollments`, body);
  }

  getActive() {
    return this.http.get<{ active: Enrollment | null }>(
      `${this.api}/program-enrollments/active`,
    );
  }

  abandon(id: string) {
    return this.http.post<Enrollment>(
      `${this.api}/program-enrollments/${id}/abandon`,
      {},
    );
  }

  // New maxes rewrite the targets of PLANNED workouts only
  recalculate(id: string, maxes: MaxInput[]) {
    return this.http.post<Enrollment>(
      `${this.api}/program-enrollments/${id}/recalculate`,
      { maxes },
    );
  }
}
