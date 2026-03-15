import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProgramService } from '../../core/program.service';
import { WorkoutService } from '../../core/workout.service';
import { Observable } from 'rxjs';

interface SetRow {
  reps: number;
  weight: number | null;
  notes: string;
  made: boolean | null;
}

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  sets: SetRow[];
}

@Component({
  selector: 'app-program-editor',
  templateUrl: './program-editor.page.html',
  styleUrls: ['./program-editor.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class ProgramEditorPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private programService = inject(ProgramService);
  private workoutService = inject(WorkoutService);
  private toastController = inject(ToastController);

  exercises$: Observable<any[]> | undefined;
  exercisesList: any[] = [];

  isEditMode = false;
  programId: string = '';
  clientId: string = '';
  programName: string = '';
  scheduledDate: string = new Date().toISOString();
  exerciseGroups: ExerciseGroup[] = [];
  selectedExerciseId: string = '';

  ngOnInit() {
    this.exercises$ = this.workoutService.getExercises();
    this.exercises$.subscribe((exs) => (this.exercisesList = exs));

    this.programId = this.route.snapshot.paramMap.get('id') || '';
    this.clientId =
      this.route.snapshot.queryParamMap.get('clientId') || '';

    if (this.programId) {
      this.isEditMode = true;
      this.programService.getProgram(this.programId).subscribe((program) => {
        this.programName = program.name;
        this.scheduledDate = program.scheduledDate;
        this.clientId = program.clientId;
        this.buildGroups(program.exercises || []);
      });
    }
  }

  private buildGroups(exercises: any[]) {
    const map = new Map<string, ExerciseGroup>();
    // Sort by order to maintain sequence
    const sorted = [...exercises].sort((a, b) => a.order - b.order);
    for (const e of sorted) {
      const id = e.exerciseId;
      if (!map.has(id)) {
        map.set(id, {
          exerciseId: id,
          exerciseName: e.exercise?.name || 'Exercise',
          sets: [],
        });
      }
      map.get(id)!.sets.push({
        reps: e.reps,
        weight: e.weight,
        notes: e.notes || '',
        made: e.made ?? null,
      });
    }
    this.exerciseGroups = Array.from(map.values());
  }

  addExercise() {
    if (!this.selectedExerciseId) return;
    const exercise = this.exercisesList.find(
      (e) => e.id === this.selectedExerciseId,
    );
    this.exerciseGroups.push({
      exerciseId: this.selectedExerciseId,
      exerciseName: exercise?.name || 'Exercise',
      sets: [{ reps: 5, weight: null, notes: '', made: null }],
    });
    this.selectedExerciseId = '';
  }

  addSet(group: ExerciseGroup) {
    const lastSet = group.sets[group.sets.length - 1];
    group.sets.push({
      reps: lastSet ? lastSet.reps : 5,
      weight: lastSet ? lastSet.weight : null,
      notes: '',
      made: null,
    });
  }

  removeSet(group: ExerciseGroup, setIndex: number) {
    group.sets.splice(setIndex, 1);
  }

  removeExercise(groupIndex: number) {
    this.exerciseGroups.splice(groupIndex, 1);
  }

  moveUp(index: number) {
    if (index <= 0) return;
    [this.exerciseGroups[index - 1], this.exerciseGroups[index]] = [
      this.exerciseGroups[index],
      this.exerciseGroups[index - 1],
    ];
  }

  moveDown(index: number) {
    if (index >= this.exerciseGroups.length - 1) return;
    [this.exerciseGroups[index], this.exerciseGroups[index + 1]] = [
      this.exerciseGroups[index + 1],
      this.exerciseGroups[index],
    ];
  }

  save() {
    if (!this.programName || !this.clientId) {
      this.presentToast('Please fill in all required fields', 'danger');
      return;
    }

    // Flatten groups into individual exercise rows
    let order = 1;
    const exercises: any[] = [];
    for (const group of this.exerciseGroups) {
      for (const set of group.sets) {
        exercises.push({
          exerciseId: group.exerciseId,
          reps: set.reps,
          weight: set.weight,
          notes: set.notes || undefined,
          order: order++,
        });
      }
    }

    const data = {
      clientId: this.clientId,
      name: this.programName,
      scheduledDate: this.scheduledDate,
      exercises,
    };

    const request = this.isEditMode
      ? this.programService.updateProgram(this.programId, data)
      : this.programService.createProgram(data);

    request.subscribe({
      next: () => {
        this.presentToast(
          this.isEditMode ? 'Program updated' : 'Program created',
          'success',
        );
        this.router.navigate(['/coach/programs', this.clientId]);
      },
      error: (err) => {
        this.presentToast(
          err.error?.message || 'Failed to save program',
          'danger',
        );
      },
    });
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger',
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
