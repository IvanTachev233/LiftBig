import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  AlertController,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { addIcons } from 'ionicons';
import { add, ellipsisHorizontal } from 'ionicons/icons';
import { CoachWorkoutService } from '../../core/coach-workout.service';
import { Client, ClientService } from '../../core/client.service';
import { Workout } from '../../core/workout.service';
import { OverflowMenuService } from '../../shared/ui/overflow-menu.service';
import { ProgressBarComponent } from '../../shared/ui/progress-bar.component';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { StatusLabel, workoutStatusLabel } from '../../shared/ui/workout-status';
import { initialsOf } from '../../shared/initials';

export type WorkoutFilter = 'all' | 'open' | 'completed';

// One client's assigned workouts: header, Assign workout, All / Open /
// Completed filter, workout cards (swipe to delete) and `⋯` → Remove client
@Component({
  selector: 'app-coach-client-workouts',
  templateUrl: './coach-client-workouts.page.html',
  styleUrls: ['./coach-client-workouts.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, ProgressBarComponent, StatusPillComponent],
})
export class CoachClientWorkoutsPage implements OnInit, ViewWillEnter {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private coachWorkoutService = inject(CoachWorkoutService);
  private clientService = inject(ClientService);
  private overflowMenu = inject(OverflowMenuService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  clientId = '';
  private refreshTrigger = new Subject<void>();

  readonly client = signal<Client | null>(null);
  /** null until the first load */
  readonly workouts = signal<Workout[] | null>(null);
  readonly filter = signal<WorkoutFilter>('all');

  readonly shownWorkouts = computed(() => {
    const workouts = this.workouts() ?? [];
    switch (this.filter()) {
      case 'open':
        return workouts.filter((w) => w.status !== 'COMPLETED');
      case 'completed':
        return workouts.filter((w) => w.status === 'COMPLETED');
      default:
        return workouts;
    }
  });

  /** Newest workout the client has logged in (in progress or completed) */
  readonly lastWorkout = computed(() =>
    (this.workouts() ?? [])
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

  async deleteWorkout(workout: Workout, event?: Event) {
    event?.stopPropagation();
    const alert = await this.alertController.create({
      header: 'Delete workout?',
      message: `Delete "${workout.name}" and the client's results?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

    this.coachWorkoutService.deleteWorkout(workout.id).subscribe({
      next: () => {
        this.presentToast('Workout deleted', 'success');
        this.refreshTrigger.next();
      },
      error: () => this.presentToast('Failed to delete', 'danger'),
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
    const alert = await this.alertController.create({
      header: 'Remove client?',
      message: "They keep their workouts, but you won't see them any more. They can rejoin with a new invite.",
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

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
