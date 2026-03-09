import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { Program, ProgramExercise } from '../../../core/program.service';

interface ExerciseSummary {
  name: string;
  setCount: number;
  reps: number;
  weight: number | null;
}

@Component({
  selector: 'app-program-card',
  templateUrl: './program-card.component.html',
  styleUrls: ['./program-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
})
export class ProgramCardComponent {
  @Input() program!: Program;
  @Input() routerLink: any[] = [];

  get exerciseSummaries(): ExerciseSummary[] {
    if (!this.program.exercises) return [];
    const map = new Map<string, ExerciseSummary>();
    for (const e of this.program.exercises) {
      const id = e.exerciseId;
      if (!map.has(id)) {
        map.set(id, {
          name: e.exercise?.name || 'Exercise',
          setCount: 0,
          reps: e.reps,
          weight: e.weight,
        });
      }
      map.get(id)!.setCount++;
    }
    return Array.from(map.values());
  }

  get uniqueExerciseCount(): number {
    return this.exerciseSummaries.length;
  }
}
