import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import { trophy } from 'ionicons/icons';
import {
  Workout,
  sourceBadge,
  workoutSource,
} from '../../../core/workout.service';
import { WeightPipe } from '../../pipes/weight.pipe';

@Component({
  selector: 'app-workout-card',
  templateUrl: './workout-card.component.html',
  styleUrls: ['./workout-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, WeightPipe],
})
export class WorkoutCardComponent {
  @Input() workout!: Workout;

  constructor() {
    // Bundled so the trophy shows without fetching its SVG
    addIcons({ trophy });
  }

  get source() {
    return workoutSource(this.workout);
  }

  /** "Coach · name" or "Program · name"; null for a self-made workout */
  get badge() {
    return sourceBadge(this.workout);
  }

  getBadgeColor(status: string): string {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'IN_PROGRESS':
        return 'primary';
      default:
        return 'medium';
    }
  }
}
