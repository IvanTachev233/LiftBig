import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Observable, switchMap } from 'rxjs';
import { CoachWorkoutService } from '../../core/coach-workout.service';
import { Workout } from '../../core/workout.service';

@Component({
  selector: 'app-coach-client-workouts',
  templateUrl: './coach-client-workouts.page.html',
  styleUrls: ['./coach-client-workouts.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
})
export class CoachClientWorkoutsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private coachWorkoutService = inject(CoachWorkoutService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  clientId = '';
  private refreshTrigger = new BehaviorSubject<void>(undefined);
  workouts$: Observable<Workout[]> | undefined;

  ngOnInit() {
    this.clientId = this.route.snapshot.paramMap.get('clientId') || '';
    this.workouts$ = this.refreshTrigger.pipe(
      switchMap(() => this.coachWorkoutService.getClientWorkouts(this.clientId)),
    );
  }

  // "logged/total sets", where a set is logged once marked made or missed
  setProgress(workout: Workout): string {
    let total = 0;
    let logged = 0;
    for (const card of workout.exercises) {
      total += card.sets.length;
      logged += card.sets.filter((set) => set.made !== null).length;
    }
    return `${logged}/${total} sets`;
  }

  statusColor(status: Workout['status']): string {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'IN_PROGRESS':
        return 'primary';
      default:
        return 'medium';
    }
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
