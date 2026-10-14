import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { WorkoutService } from '../../core/workout.service';
import { ExerciseHistoryComponent } from '../../shared/components/exercise-history/exercise-history.component';

// Exercise detail, pushed from History › Lifts: the exercise's rep max history
@Component({
  selector: 'app-exercise-detail',
  templateUrl: './exercise-detail.page.html',
  styleUrls: ['./exercise-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, ExerciseHistoryComponent],
})
export class ExerciseDetailPage implements OnInit {
  private workoutService = inject(WorkoutService);
  readonly exerciseId: string = inject(ActivatedRoute).snapshot.paramMap.get('exerciseId') ?? '';

  name = '';

  @ViewChild(ExerciseHistoryComponent) history?: ExerciseHistoryComponent;

  ngOnInit() {
    this.workoutService.getExercises().subscribe({
      next: (exercises) => {
        this.name = exercises.find((e) => e.id === this.exerciseId)?.name ?? 'Exercise';
      },
      error: () => (this.name = 'Exercise'),
    });
  }

  addEntry() {
    this.history?.openAddEntry();
  }
}
