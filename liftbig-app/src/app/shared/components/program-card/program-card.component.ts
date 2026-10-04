import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { Program } from '../../../core/program.service';

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
  @Input() showDelete = false;
  @Output() remove = new EventEmitter<void>();

  onRemove(event: Event) {
    event.stopPropagation();
    this.remove.emit();
  }

  // One summary per card, so a repeated exercise is listed again; reps and weight come from the first set
  get exerciseSummaries(): ExerciseSummary[] {
    return [...(this.program.exercises || [])]
      .sort((a, b) => a.order - b.order)
      .map((card) => {
        const sets = [...(card.sets || [])].sort((a, b) => a.order - b.order);
        return {
          name: card.exercise?.name || 'Exercise',
          setCount: sets.length,
          reps: sets[0]?.reps ?? 0,
          weight: sets[0]?.weight ?? null,
        };
      });
  }

  get exerciseCount(): number {
    return this.program.exercises?.length ?? 0;
  }
}
