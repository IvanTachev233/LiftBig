import { Component, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { LiftService } from '../../core/lift.service';
import { Enrollment, ProgramService } from '../../core/program.service';
import { Workout } from '../../core/workout.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { localDay } from '../../core/local-date';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { ConfirmSheetService } from '../../shared/ui/confirm-sheet.component';
import { RecalculateSheetComponent } from './recalculate-sheet.component';
import { DateBlockRowComponent } from '../../shared/ui/date-block-row.component';
import { ProgressBarComponent } from '../../shared/ui/progress-bar.component';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { StatusLabel, workoutStatusLabel } from '../../shared/ui/workout-status';

const DAY_MS = 24 * 60 * 60 * 1000;

// The client's active program: progress, its sessions week by week,
// Update 1RMs & recalculate and Abandon
@Component({
  selector: 'app-active-program',
  templateUrl: './active-program.page.html',
  styleUrls: ['./active-program.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    FormsModule,
    DateBlockRowComponent,
    ProgressBarComponent,
    StatusPillComponent,
  ],
})
export class ActiveProgramPage implements ViewWillEnter {
  private programService = inject(ProgramService);
  private liftService = inject(LiftService);
  private confirmSheet = inject(ConfirmSheetService);

  @ViewChild('programSummary') programSummary!: TemplateRef<unknown>;
  private toastController = inject(ToastController);
  private router = inject(Router);
  private bottomSheet = inject(BottomSheetService);
  readonly units = inject(WeightUnitService);

  /** The device clock; specs replace it */
  now: () => Date = () => new Date();

  active: Enrollment | null = null;
  loaded = false;
  weeks: { week: number; sessions: Workout[] }[] = [];
  selectedWeek = 1;
  // Sport label by exercise id, and the sport's lift order
  labels: Record<string, string> = {};
  liftOrder: string[] = [];
  // The Recalculate form: 1RM per lift, in the user's unit
  recalculating = false;
  maxes: Record<string, number | null> = {};
  saving = false;

  ionViewWillEnter() {
    this.recalculating = false;
    this.programService.getActive().subscribe({
      next: ({ active }) => {
        this.loaded = true;
        this.show(active);
        if (active) this.loadLabels(active);
      },
      error: () => {
        this.loaded = true;
        this.presentToast("Couldn't load your program");
      },
    });
  }

  private loadLabels(enrollment: Enrollment) {
    this.programService.getSports().subscribe((sports) => {
      const sport = sports.find((s) => s.id === enrollment.program.sportId);
      const lifts = [...(sport?.requiredLifts ?? [])].sort(
        (a, b) => a.displayOrder - b.displayOrder,
      );
      const labels: Record<string, string> = {};
      for (const lift of lifts) labels[lift.exerciseId] = lift.label;
      this.labels = labels;
      this.liftOrder = lifts.map((lift) => lift.exerciseId);
    });
  }

  private show(enrollment: Enrollment | null) {
    this.active = enrollment?.status === 'ACTIVE' ? enrollment : null;
    if (!this.active) {
      this.weeks = [];
      return;
    }
    const start = Date.parse(this.active.startDate);
    const byWeek = new Map<number, Workout[]>();
    for (const workout of this.active.workouts) {
      const days = Math.round((Date.parse(this.day(workout)) - start) / DAY_MS);
      const week = Math.floor(days / 7) + 1;
      byWeek.set(week, [...(byWeek.get(week) ?? []), workout]);
    }
    this.weeks = [...byWeek]
      .sort(([a], [b]) => a - b)
      .map(([week, sessions]) => ({
        week,
        sessions: [...sessions].sort((a, b) => this.day(a).localeCompare(this.day(b))),
      }));
    // The week today falls in; before the start, the first week
    const today = Math.round((Date.parse(localDay(this.now())) - start) / DAY_MS);
    const current = Math.floor(today / 7) + 1;
    const weeks = this.weeks.map((w) => w.week);
    this.selectedWeek = weeks.includes(current)
      ? current
      : current > Math.max(...weeks)
        ? Math.max(...weeks)
        : weeks[0];
  }

  selectWeek(value: unknown) {
    const week = Number(value);
    if (this.weeks.some((w) => w.week === week)) this.selectedWeek = week;
  }

  get shownSessions(): Workout[] {
    return this.weeks.find((w) => w.week === this.selectedWeek)?.sessions ?? [];
  }

  get completedCount(): number {
    return this.active?.workouts.filter((w) => w.status === 'COMPLETED').length ?? 0;
  }

  /** The last session's day, or the end of the last week */
  get endDay(): string | null {
    const active = this.active;
    if (!active) return null;
    const days = active.workouts.map((w) => this.day(w)).sort();
    if (days.length) return days[days.length - 1];
    const end = new Date(Date.parse(active.startDate) + (active.program.durationWeeks * 7 - 1) * DAY_MS);
    return end.toISOString().slice(0, 10);
  }

  /** Exercise names of the session, e.g. "Snatch · Snatch Pull · Back Squat" */
  exerciseNames(workout: Workout): string | null {
    const names = (workout.exercises ?? [])
      .map((c) => c.exercise?.name)
      .filter((n): n is string => !!n);
    return names.length ? names.join(' · ') : null;
  }

  open(workout: Workout) {
    this.router.navigate(['/workout-logger'], { queryParams: { id: workout.id } });
  }

  /** The workout's calendar day, YYYY-MM-DD */
  day(workout: Workout): string {
    return workout.date.slice(0, 10);
  }

  status(workout: Workout): StatusLabel {
    return workoutStatusLabel(workout, 'CLIENT', this.now());
  }

  /** Lifts of the Recalculate form, in the sport's order */
  get lifts(): string[] {
    const position = (id: string) => {
      const i = this.liftOrder.indexOf(id);
      return i < 0 ? this.liftOrder.length : i;
    };
    return Object.keys(this.active?.maxesSnapshot ?? {}).sort(
      (a, b) => position(a) - position(b),
    );
  }

  label(exerciseId: string): string {
    return this.labels[exerciseId] ?? 'Lift';
  }

  /**
   * Opens the update sheet prefilled with the snapshot, then the current bests
   * as they arrive; confirming recalculates with the maxes it returns
   */
  async openRecalculate() {
    const active = this.active;
    if (!active) return;
    this.recalculating = true;
    const maxes: Record<string, number | null> = {};
    for (const id of this.lifts) {
      maxes[id] = this.units.toInput(active.maxesSnapshot[id]);
    }
    this.maxes = maxes;
    this.liftService.getBests(this.lifts).subscribe((bests) => {
      for (const best of bests) {
        if (best.exerciseId in maxes) {
          maxes[best.exerciseId] = this.units.toInput(best.weightKg);
        }
      }
    });
    const { data, role } = await this.bottomSheet.open<Record<string, number | null>>(
      RecalculateSheetComponent,
      {
        label: 'Update 1RMs',
        props: { lifts: this.lifts.map((id) => ({ id, label: this.label(id) })), maxes },
      },
    );
    if (role !== 'confirm' || !data) {
      this.recalculating = false;
      return;
    }
    this.maxes = data;
    this.recalculate();
  }

  get canRecalculate(): boolean {
    return (
      !this.saving &&
      this.lifts.every((id) => this.maxes[id] !== null && Number(this.maxes[id]) > 0)
    );
  }

  recalculate() {
    if (!this.active || !this.canRecalculate) return;
    this.saving = true;
    this.programService
      .recalculate(
        this.active.id,
        this.lifts.map((exerciseId) => ({
          exerciseId,
          weightKg: this.units.toKg(Number(this.maxes[exerciseId]))!,
        })),
      )
      .subscribe({
        next: (enrollment) => {
          this.saving = false;
          this.recalculating = false;
          this.show(enrollment);
        },
        error: () => {
          this.saving = false;
          this.presentToast("Couldn't update the targets");
        },
      });
  }

  async abandon() {
    const active = this.active;
    if (!active) return;
    const confirmed = await this.confirmSheet.confirm({
      title: 'Abandon this program?',
      message: 'Planned sessions are deleted. Started and completed ones stay.',
      confirmLabel: 'Abandon program',
      icon: 'flag-outline',
      summary: this.programSummary,
      summaryContext: active,
    });
    if (!confirmed) return;
    this.programService.abandon(active.id).subscribe({
      next: (enrollment) => this.show(enrollment),
      error: () => this.presentToast("Couldn't abandon the program"),
    });
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
