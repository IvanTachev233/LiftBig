import { Component, EventEmitter, Input, Output, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Workout, isPlanLocked, workoutSource } from '../../../core/workout.service';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { ConfirmSheetService } from '../../ui/confirm-sheet.component';
import { DateBlockRowComponent } from '../../ui/date-block-row.component';
import { StatusPillComponent } from '../../ui/status-pill.component';
import { SwipeDeleteRowComponent } from '../../ui/swipe-delete-row.component';
import { needsDeleteConfirm, prWarning, workoutStatusLabel } from '../../ui/workout-status';

// A History row: date block, name with PR/Coach/Program tags, status and volume;
// swipe to delete an own workout (confirmed when completed or logged; the
// page deletes it behind an undo toast)
@Component({
  selector: 'app-workout-list-item',
  templateUrl: './workout-list-item.component.html',
  styleUrls: ['./workout-list-item.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    DateBlockRowComponent,
    StatusPillComponent,
    SwipeDeleteRowComponent,
  ],
})
export class WorkoutListItemComponent {
  @Input() workout!: Workout;
  /** The day the status words are relative to */
  @Input() today = new Date();
  /** Delete was chosen (and confirmed when needed) */
  @Output() deleteRequested = new EventEmitter<Workout>();

  readonly units = inject(WeightUnitService);
  private confirmSheet = inject(ConfirmSheetService);

  @ViewChild('row') row!: TemplateRef<unknown>;

  // Ignores Delete while the sheet is open
  private confirming = false;

  // Coach and program workouts can't be deleted here
  get isLocked(): boolean {
    return isPlanLocked(this.workout);
  }

  get source() {
    return workoutSource(this.workout);
  }

  /** "Completed · 3 exercises", "In progress", "Missed", "Today" or "Planned" */
  get status(): { text: string; tone: 'default' | 'accent' | 'muted' } {
    const { kind, text } = workoutStatusLabel(this.workout, 'CLIENT', this.today);
    if (kind === 'done') {
      const count = this.workout.exercises?.length ?? 0;
      return { text: `Completed · ${count} ${count === 1 ? 'exercise' : 'exercises'}`, tone: 'default' };
    }
    if (kind === 'in-progress') return { text, tone: 'accent' };
    return { text, tone: kind === 'missed' ? 'muted' : 'default' };
  }

  async requestDelete() {
    if (this.confirming || this.isLocked) return;
    if (needsDeleteConfirm(this.workout)) {
      this.confirming = true;
      const confirmed = await this.confirmSheet
        .confirm({
          title: 'Delete this workout?',
          message: 'Its sets will be removed from your history and lift records.',
          confirmLabel: 'Delete workout',
          summary: this.row,
          summaryContext: this.workout,
          warning: prWarning(this.workout, (kg) => this.units.format(kg)),
        })
        .finally(() => (this.confirming = false));
      if (!confirmed) return;
    }
    this.deleteRequested.emit(this.workout);
  }
}
