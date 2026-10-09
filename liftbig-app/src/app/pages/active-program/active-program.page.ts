import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  AlertController,
  IonicModule,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { LiftService } from '../../core/lift.service';
import { Enrollment, ProgramService } from '../../core/program.service';
import { Workout, WorkoutStatus } from '../../core/workout.service';
import { WeightUnitService } from '../../core/weight-unit.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<WorkoutStatus, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Done',
};

// The client's active program: its sessions by week, Recalculate and Abandon
@Component({
  selector: 'app-active-program',
  templateUrl: './active-program.page.html',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class ActiveProgramPage implements ViewWillEnter {
  private programService = inject(ProgramService);
  private liftService = inject(LiftService);
  private alertCtrl = inject(AlertController);
  private toastController = inject(ToastController);
  readonly units = inject(WeightUnitService);

  active: Enrollment | null = null;
  loaded = false;
  weeks: { week: number; sessions: Workout[] }[] = [];
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
      .map(([week, sessions]) => ({ week, sessions }));
  }

  /** The workout's calendar day, YYYY-MM-DD */
  day(workout: Workout): string {
    return workout.date.slice(0, 10);
  }

  statusLabel(workout: Workout): string {
    return STATUS_LABELS[workout.status];
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

  /** Opens the form prefilled with the current bests, else the snapshot */
  openRecalculate() {
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
        if (best.exerciseId in this.maxes) {
          this.maxes[best.exerciseId] = this.units.toInput(best.weightKg);
        }
      }
    });
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
    const alert = await this.alertCtrl.create({
      header: 'Abandon program?',
      message: 'Planned sessions are deleted. Started and completed ones stay.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Abandon', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
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
