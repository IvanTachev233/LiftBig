import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { Workout, WorkoutCard, WorkoutService, sourceBadge } from '../../core/workout.service';
import { Enrollment, ProgramService, sessionPosition } from '../../core/program.service';
import { BestLift, LiftService } from '../../core/lift.service';
import { ProfileService } from '../../core/profile.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { WorkoutCopyService } from '../../core/workout-copy.service';
import { ReadCacheService } from '../../core/read-cache.service';
import { DateBlockRowComponent } from '../../shared/ui/date-block-row.component';
import { WeekStripComponent } from '../../shared/ui/week-strip.component';
import { LargeTitleComponent } from '../../shared/ui/large-title.component';
import { TabHeaderComponent } from '../../shared/ui/tab-header.component';
import { StripDay, greeting, recentPr, todayWorkout, upNext, weekStrip } from './today';

// Today: week strip, today's session, up next and a recent PR
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    DateBlockRowComponent,
    WeekStripComponent,
    TabHeaderComponent,
    LargeTitleComponent,
  ],
})
export class DashboardPage implements ViewWillEnter, OnDestroy {
  private workoutService = inject(WorkoutService);
  private programService = inject(ProgramService);
  private liftService = inject(LiftService);
  private profileService = inject(ProfileService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private copies = inject(WorkoutCopyService);
  private cache = inject(ReadCacheService);
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
  // Whose answers the page shows, and the requests of the current visit
  private shownFor: string | undefined;
  private requests = new Subscription();

  // Runs on every visit; cached pages don't re-run ngOnInit. The page
  // outlives a sign-out, so answers only count for the user they were asked
  // for, and a new visit drops the last one's requests.
  ionViewWillEnter() {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.now = new Date();
    const userId = this.auth.currentUser()?.id;
    if (userId !== this.shownFor) this.clear(userId);
    const forUser =
      <T>(apply: (value: T) => void) =>
      (value: T) => {
        if (this.auth.currentUser()?.id === userId) apply(value);
      };

    this.requests.add(
      // Without a connection, the list last loaded on this phone
      this.cache.read('workouts', this.workoutService.getAllWorkouts()).subscribe({
        // Workouts with changes waiting on this phone show as they are here
        next: forUser((workouts: Workout[]) => {
          this.workouts = this.copies.overlay(workouts);
          this.loaded = true;
          this.refresh();
          this.namePr();
        }),
        // Keeps this user's last list
        error: forUser(() => {
          this.workouts = this.copies.overlay(this.workouts);
          this.loaded = true;
          this.refresh();
        }),
      }),
    );
    this.requests.add(
      this.programService.getActive().subscribe({
        next: forUser(({ active }: { active: Enrollment | null }) => (this.active = active?.status === 'ACTIVE' ? active : null)),
        error: () => undefined,
      }),
    );
    this.requests.add(
      this.liftService.getBests().subscribe({
        next: forUser((bests: BestLift[]) => {
          this.pr = recentPr(bests, this.now);
          this.namePr();
        }),
        error: () => undefined,
      }),
    );
    this.requests.add(
      this.profileService.getMe().subscribe({
        next: forUser((profile: { name: string | null }) => (this.name = profile.name)),
        error: forUser(() => (this.name = null)),
      }),
    );
  }

  ngOnDestroy() {
    this.requests.unsubscribe();
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

  /** Starts over for another user, so nothing of the last one shows */
  private clear(userId: string | undefined) {
    this.shownFor = userId;
    this.loaded = false;
    this.workouts = [];
    this.name = null;
    this.active = null;
    this.pr = null;
    this.prName = null;
    this.exerciseNames = null;
    this.refresh();
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
