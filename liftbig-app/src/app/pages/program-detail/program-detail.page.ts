import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  IonicModule,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { LiftService } from '../../core/lift.service';
import { localDay } from '../../core/local-date';
import {
  ProgramDetail,
  ProgramExercise,
  ProgramService,
  ProgramSession,
} from '../../core/program.service';
import { WeightUnitService } from '../../core/weight-unit.service';

// Start program: the program's facts, the 1RMs and first day it starts
// with, and its schedule in a sheet
import { ConfirmSheetService } from '../../shared/ui/confirm-sheet.component';
@Component({
  selector: 'app-program-detail',
  templateUrl: './program-detail.page.html',
  styleUrls: ['./program-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class ProgramDetailPage implements ViewWillEnter {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private programService = inject(ProgramService);
  private liftService = inject(LiftService);
  private confirmSheet = inject(ConfirmSheetService);
  private toastController = inject(ToastController);
  readonly units = inject(WeightUnitService);

  program: ProgramDetail | null = null;
  weeks: { week: number; sessions: ProgramSession[] }[] = [];
  // 1RM per reference lift, in the user's unit
  maxes: Record<string, number | null> = {};
  // The first session's day; today or later
  minDate = localDay();
  startDate = this.minDate;
  starting = false;
  // The date picker and schedule sheets
  pickingDate = false;
  showingSchedule = false;

  ionViewWillEnter() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.minDate = localDay();
    if (this.startDate < this.minDate) this.startDate = this.minDate;
    this.programService.getProgram(id).subscribe({
      next: (program) => this.show(program),
      error: () => this.presentToast("Couldn't load the program"),
    });
  }

  private show(program: ProgramDetail) {
    this.program = program;
    const byWeek = new Map<number, ProgramSession[]>();
    for (const session of program.sessions) {
      byWeek.set(session.week, [...(byWeek.get(session.week) ?? []), session]);
    }
    this.weeks = [...byWeek].map(([week, sessions]) => ({ week, sessions }));
    const maxes: Record<string, number | null> = {};
    for (const lift of program.referenceLifts) maxes[lift.exerciseId] = null;
    this.maxes = maxes;
    if (program.referenceLifts.length === 0) return;
    // Prefills each max with the user's best 1RM
    this.liftService
      .getBests(program.referenceLifts.map((lift) => lift.exerciseId))
      .subscribe((bests) => {
        for (const best of bests) {
          if (best.exerciseId in this.maxes && this.maxes[best.exerciseId] === null) {
            this.maxes[best.exerciseId] = this.units.toInput(best.weightKg);
          }
        }
      });
  }

  /** e.g. "Pause Squat 3 × 3 @ 55% of Squat" */
  exerciseLine(exercise: ProgramExercise): string {
    const line = `${exercise.exerciseName} ${exercise.sets} × ${exercise.reps}`;
    return exercise.percentOf1RM === null
      ? line
      : `${line} @ ${exercise.percentOf1RM}% of ${exercise.referenceLabel}`;
  }

  get canStart(): boolean {
    return (
      !!this.program &&
      !this.starting &&
      Object.values(this.maxes).every((max) => max !== null && Number(max) > 0)
    );
  }

  dateChanged(event: { detail: { value?: string | string[] | null } }) {
    const value = event.detail.value;
    if (typeof value === 'string') this.startDate = value.slice(0, 10);
    this.pickingDate = false;
  }

  start(abandonCurrent = false) {
    if (!this.program || !this.canStart) return;
    this.starting = true;
    this.programService
      .enroll({
        programId: this.program.id,
        startDate: this.startDate,
        maxes: this.program.referenceLifts.map((lift) => ({
          exerciseId: lift.exerciseId,
          weightKg: this.units.toKg(Number(this.maxes[lift.exerciseId]))!,
        })),
        ...(abandonCurrent ? { abandonCurrent } : {}),
      })
      .subscribe({
        next: () => {
          this.starting = false;
          this.router.navigate(['/programs/active']);
        },
        error: (error: HttpErrorResponse) => {
          this.starting = false;
          if (error.status === 409 && !abandonCurrent) {
            this.confirmAbandon();
          } else {
            this.presentToast("Couldn't start the program");
          }
        },
      });
  }

  private async confirmAbandon() {
    const confirmed = await this.confirmSheet.confirm({
      title: 'Abandon current program?',
      message: 'You already have an active program. Its planned workouts will be deleted.',
      confirmLabel: 'Abandon and start',
      icon: 'flag-outline',
    });
    if (confirmed) this.start(true);
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
