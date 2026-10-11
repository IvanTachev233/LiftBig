import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { WorkoutService, Workout } from '../../core/workout.service';
import { BestLift, LiftService } from '../../core/lift.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';
import { StatTile, StatTilesComponent } from '../../shared/ui/stat-tiles.component';
import { MonthGroup, historyWorkouts, monthGroups, weekTotals } from './history';

// History: past workouts by month (Workouts) and best lifts (Lifts)
@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, WorkoutListItemComponent, StatTilesComponent],
})
export class StatsPage implements ViewWillEnter {
  workoutService = inject(WorkoutService);
  private liftService = inject(LiftService);
  private router = inject(Router);
  readonly units = inject(WeightUnitService);

  /** The device clock; specs replace it */
  now: () => Date = () => new Date();

  view: 'workouts' | 'lifts' = 'workouts';
  today = this.now();
  workouts: Workout[] | null = null;
  groups: MonthGroup[] = [];
  // Best 1RM per exercise, by exercise name; null until loaded
  lifts: { best: BestLift; name: string }[] | null = null;
  private exerciseNames: Map<string, string> | null = null;

  // Runs on every visit; cached pages don't re-run ngOnInit
  ionViewWillEnter() {
    // Profile's My 1RMs opens /history?view=lifts
    if (this.router.parseUrl(this.router.url).queryParams['view'] === 'lifts') {
      this.view = 'lifts';
    }
    this.workoutService.getAllWorkouts().subscribe((workouts) => {
      this.today = this.now();
      this.workouts = historyWorkouts(workouts, this.today);
      this.groups = monthGroups(this.workouts, this.today);
    });
    if (this.view === 'lifts') this.loadLifts();
  }

  get tiles(): StatTile[] {
    const { sessions, volumeKg } = weekTotals(this.workouts ?? [], this.today);
    return [
      { label: 'This week', value: sessions, unit: sessions === 1 ? 'session' : 'sessions' },
      {
        label: 'Volume',
        value: Math.round(this.units.toDisplay(volumeKg)).toLocaleString('en-US'),
        unit: this.units.unit(),
      },
    ];
  }

  onViewChange(value: unknown) {
    this.view = value === 'lifts' ? 'lifts' : 'workouts';
    if (this.view === 'lifts') this.loadLifts();
  }

  openLift(exerciseId: string) {
    this.router.navigate(['/history/lifts', exerciseId]);
  }

  /** Every best 1RM, named from the exercise list (loaded once) */
  private loadLifts() {
    this.liftService.getBests().subscribe({
      next: (bests) => {
        if (this.exerciseNames) {
          this.showLifts(bests);
          return;
        }
        this.workoutService.getExercises().subscribe({
          next: (exercises) => {
            this.exerciseNames = new Map(exercises.map((e) => [e.id, e.name]));
            this.showLifts(bests);
          },
          error: () => (this.lifts = this.lifts ?? []),
        });
      },
      error: () => (this.lifts = this.lifts ?? []),
    });
  }

  private showLifts(bests: BestLift[]) {
    this.lifts = bests
      .map((best) => ({ best, name: this.exerciseNames?.get(best.exerciseId) ?? 'Exercise' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  onWorkoutDeleted(id: string) {
    this.workouts = this.workouts?.filter((workout) => workout.id !== id) ?? null;
    this.groups = monthGroups(this.workouts ?? [], this.today);
  }
}
