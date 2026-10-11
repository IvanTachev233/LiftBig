import { Component, OnInit, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, formatDate } from '@angular/common';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { addIcons } from 'ionicons';
import { add, ellipsisHorizontal } from 'ionicons/icons';
import { CoachWorkoutService } from '../../core/coach-workout.service';
import { Client, ClientService } from '../../core/client.service';
import { Workout } from '../../core/workout.service';
import { ConfirmSheetService } from '../../shared/ui/confirm-sheet.component';
import { OverflowMenuService } from '../../shared/ui/overflow-menu.service';
import { ProgressBarComponent } from '../../shared/ui/progress-bar.component';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { SwipeDeleteRowComponent } from '../../shared/ui/swipe-delete-row.component';
import { UndoToastService } from '../../shared/ui/undo-toast.service';
import { StatusLabel, needsDeleteConfirm, workoutStatusLabel } from '../../shared/ui/workout-status';
import { initialsOf } from '../../shared/initials';

export type WorkoutFilter = 'all' | 'open' | 'completed';

// One client's assigned workouts: header, Assign workout, All / Open /
// Completed filter, workout cards (swipe to delete) and `⋯` → Remove client
@Component({
  selector: 'app-coach-client-workouts',
  templateUrl: './coach-client-workouts.page.html',
  styleUrls: ['./coach-client-workouts.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    ProgressBarComponent,
    StatusPillComponent,
    SwipeDeleteRowComponent,
  ],
})
export class CoachClientWorkoutsPage implements OnInit, ViewWillEnter {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private coachWorkoutService = inject(CoachWorkoutService);
  private clientService = inject(ClientService);
  private overflowMenu = inject(OverflowMenuService);
  private confirmSheet = inject(ConfirmSheetService);
  private undoToast = inject(UndoToastService);
  private toastController = inject(ToastController);

  clientId = '';
  private refreshTrigger = new Subject<void>();

  readonly client = signal<Client | null>(null);
  /** null until the first load */
  readonly workouts = signal<Workout[] | null>(null);
  readonly filter = signal<WorkoutFilter>('all');
  // Deleted behind the undo toast
  private readonly hidden = signal<ReadonlySet<string>>(new Set());

  @ViewChild('workoutCard') workoutCard!: TemplateRef<unknown>;
  @ViewChild('clientRow') clientRow!: TemplateRef<unknown>;
  // Ignores Delete while the sheet is open
  private confirming = false;

  readonly shownWorkouts = computed(() => {
    const workouts = this.visible();
    switch (this.filter()) {
      case 'open':
        return workouts.filter((w) => w.status !== 'COMPLETED');
      case 'completed':
        return workouts.filter((w) => w.status === 'COMPLETED');
      default:
        return workouts;
    }
  });

  private readonly visible = computed(() =>
    (this.workouts() ?? []).filter((w) => !this.hidden().has(w.id)),
  );

  /** Newest workout the client has logged in (in progress or completed) */
  readonly lastWorkout = computed(() =>
    this.visible()
      .filter((w) => w.status !== 'PLANNED')
      .reduce<Workout | null>((latest, w) => (!latest || w.date > latest.date ? w : latest), null),
  );

  readonly initials = computed(() => initialsOf(this.client()?.name, this.client()?.email));

  constructor() {
    addIcons({ add, ellipsisHorizontal });
    // A newer refresh cancels an older one; a failed load keeps the list
    this.refreshTrigger
      .pipe(
        switchMap(() =>
          this.coachWorkoutService.getClientWorkouts(this.clientId).pipe(
            catchError(() => {
              this.presentToast("Couldn't load the workouts", 'danger');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((workouts) => this.workouts.set(workouts));
  }

  ngOnInit() {
    this.clientId = this.route.snapshot.paramMap.get('clientId') || '';
    // The header's name and email; the list endpoint is the only client lookup
    this.clientService.getClients().subscribe({
      next: (clients) => this.client.set(clients.find((c) => c.id === this.clientId) ?? null),
      error: () => undefined,
    });
  }

  // Runs on every visit; cached pages don't re-run ngOnInit
  ionViewWillEnter() {
    this.refreshTrigger.next();
  }

  setFilter(value: unknown) {
    if (value === 'all' || value === 'open' || value === 'completed') this.filter.set(value);
  }

  status(workout: Workout): StatusLabel {
    return workoutStatusLabel(workout, 'COACH');
  }

  /** Sets marked made or missed, and all sets */
  setCounts(workout: Workout): { logged: number; total: number } {
    let total = 0;
    let logged = 0;
    for (const card of workout.exercises) {
      total += card.sets.length;
      logged += card.sets.filter((set) => set.made !== null).length;
    }
    return { logged, total };
  }

  /**
   * Deletes behind the undo toast; a completed workout or one with logged
   * sets is confirmed first
   */
  async requestDelete(workout: Workout) {
    if (this.confirming) return;
    if (needsDeleteConfirm(workout)) {
      this.confirming = true;
      const confirmed = await this.confirmSheet
        .confirm({
          title: 'Delete this workout?',
          message: "The client's logged results are deleted with it.",
          confirmLabel: 'Delete workout',
          summary: this.workoutCard,
          summaryContext: workout,
        })
        .finally(() => (this.confirming = false));
      if (!confirmed) return;
    }
    const day = formatDate(workout.date, 'EEE d MMM', 'en-US', 'UTC');
    await this.undoToast.softDelete({
      title: 'Workout deleted',
      sub: `${workout.name} · ${day}`,
      hide: () => this.setHidden(workout.id, true),
      restore: () => this.setHidden(workout.id, false),
      commit: () => this.coachWorkoutService.deleteWorkout(workout.id),
      done: () => {
        this.workouts.update((list) => list?.filter((w) => w.id !== workout.id) ?? null);
        this.setHidden(workout.id, false);
      },
      failed: "Couldn't delete the workout",
    });
  }

  private setHidden(id: string, hidden: boolean) {
    this.hidden.update((set) => {
      const next = new Set(set);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** The header `⋯`: Remove client, confirmed, then back to Clients */
  async openClientMenu() {
    const action = await this.overflowMenu.open([
      { id: 'remove', text: 'Remove client', destructive: true },
    ]);
    if (action === 'remove') await this.removeClient();
  }

  private async removeClient() {
    const confirmed = await this.confirmSheet.confirm({
      title: 'Remove this client?',
      message: "They keep their workouts, but you won't see them any more. They can rejoin with a new invite.",
      confirmLabel: 'Remove client',
      icon: 'person-remove-outline',
      summary: this.clientRow,
    });
    if (!confirmed) return;

    this.clientService.removeClient(this.clientId).subscribe({
      next: () => {
        this.presentToast('Client removed', 'success');
        this.router.navigate(['/coach/clients']);
      },
      error: () => this.presentToast('Failed to remove client', 'danger'),
    });
  }

  private async presentToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
