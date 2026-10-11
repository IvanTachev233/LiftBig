import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { Workout, WorkoutCard, WorkoutService, sourceBadge } from '../../core/workout.service';
import { Enrollment, ProgramService, sessionPosition } from '../../core/program.service';
import { BestLift, LiftService } from '../../core/lift.service';
import { ProfileService } from '../../core/profile.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { DateBlockRowComponent } from '../../shared/ui/date-block-row.component';
import { WeekStripComponent } from '../../shared/ui/week-strip.component';
import { StripDay, greeting, recentPr, todayWorkout, upNext, weekStrip } from './today';

// Today: week strip, today's session, up next and a recent PR
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, DateBlockRowComponent, WeekStripComponent],
})
export class DashboardPage implements ViewWillEnter {
  private workoutService = inject(WorkoutService);
  private programService = inject(ProgramService);
  private liftService = inject(LiftService);
  private profileService = inject(ProfileService);
  private router = inject(Router);
  readonly units = inject(WeightUnitService);

  now = new Date();
  loaded = false;
  name: string | null = null;
  active: Enrollment | null = null;
  strip: StripDay[] = weekStrip([], this.now);
  today: Workout | null = null;
  next: Workout[] = [];
  doneToday = false;
  pr: BestLift | null = null;
  prName: string | null = null;

  private workouts: Workout[] = [];
  private exerciseNames: Map<string, string> | null = null;

  // Runs on every visit; cached pages don't re-run ngOnInit
  ionViewWillEnter() {
    this.now = new Date();
    this.workoutService.getAllWorkouts().subscribe({
      next: (workouts) => {
        this.workouts = workouts;
        this.loaded = true;
        this.refresh();
        this.namePr();
      },
      error: () => (this.loaded = true),
    });
    this.programService.getActive().subscribe({
      next: ({ active }) => (this.active = active?.status === 'ACTIVE' ? active : null),
      error: () => undefined,
    });
    this.liftService.getBests().subscribe({
      next: (bests) => {
        this.pr = recentPr(bests, this.now);
        this.namePr();
      },
      error: () => undefined,
    });
    this.profileService.getMe().subscribe({
      next: (profile) => (this.name = profile.name),
      error: () => (this.name = null),
    });
  }

  get greeting(): string {
    return greeting(this.now, this.name);
  }

  /** e.g. "Today · Week 1 · Day 2" for a session of the active program */
  get eyebrow(): string {
    const workout = this.today;
    const active = this.active;
    if (workout && active && workout.program?.enrollmentId === active.id) {
      const position = sessionPosition(active, workout.id);
      if (position) return `Today · Week ${position.week} · Day ${position.day}`;
    }
    return 'Today';
  }

  /** "Coach · Kim" or "Program · name"; nothing for an own workout */
  sub(workout: Workout): string | null {
    return sourceBadge(workout);
  }

  /** The planned weight of the card's first set */
  firstWeight(card: WorkoutCard): number | null {
    return card.sets[0]?.weight ?? null;
  }

  open(workout: Workout) {
    this.router.navigate(['/workout-logger'], { queryParams: { id: workout.id } });
  }

  /** A new manual draft, as the logger opens without an id */
  emptyWorkout() {
    this.router.navigate(['/workout-logger']);
  }

  openPr() {
    if (this.pr) this.router.navigate(['/history/lifts', this.pr.exerciseId]);
  }

  private refresh() {
    this.strip = weekStrip(this.workouts, this.now);
    this.today = todayWorkout(this.workouts, this.now);
    this.next = upNext(this.workouts, this.now);
    this.doneToday = this.strip.some((d) => d.today && d.dot === 'done');
  }

  /** The PR's exercise name: from the loaded workouts, else from the exercise list */
  private namePr() {
    const pr = this.pr;
    if (!pr || !this.loaded) {
      this.prName = null;
      return;
    }
    const card = this.workouts
      .reduce<WorkoutCard[]>((all, w) => all.concat(w.exercises ?? []), [])
      .find((c) => c.exerciseId === pr.exerciseId && c.exercise?.name);
    if (card) {
      this.prName = card.exercise!.name;
      return;
    }
    if (this.exerciseNames) {
      this.prName = this.exerciseNames.get(pr.exerciseId) ?? null;
      return;
    }
    this.workoutService.getExercises().subscribe({
      next: (exercises) => {
        this.exerciseNames = new Map(exercises.map((e) => [e.id, e.name]));
        if (this.pr === pr) this.prName = this.exerciseNames.get(pr.exerciseId) ?? null;
      },
      error: () => undefined,
    });
  }
}
