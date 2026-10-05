import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkoutService, Workout } from '../../core/workout.service';
import { AuthService } from '../../core/auth.service';
import { ClientService } from '../../core/client.service';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    FormsModule,
    WorkoutListItemComponent,
  ],
})
export class DashboardPage implements ViewWillEnter {
  private workoutService = inject(WorkoutService);
  private clientService = inject(ClientService);
  private toastController = inject(ToastController);
  public authService = inject(AuthService);

  // Own and coach-assigned workouts, soonest first
  upcomingWorkouts: Workout[] | null = null;
  user = this.authService.currentUser;
  inviteToken: string = '';

  get hasCoach(): boolean {
    return !!this.user()?.coachId;
  }

  // Runs on every visit; cached pages don't re-run ngOnInit
  ionViewWillEnter() {
    this.loadUpcoming();
  }

  private loadUpcoming() {
    this.workoutService.getUpcoming().subscribe((workouts) => {
      this.upcomingWorkouts = [...workouts].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    });
  }

  onWorkoutDeleted(id: string) {
    this.upcomingWorkouts =
      this.upcomingWorkouts?.filter((workout) => workout.id !== id) ?? null;
  }

  acceptInvite() {
    if (!this.inviteToken) return;
    this.clientService.acceptInvite(this.inviteToken).subscribe({
      next: () => {
        this.presentToast('Invite accepted! You are now linked to your coach.', 'success');
        this.inviteToken = '';
        this.loadUpcoming();
      },
      error: (err) => {
        this.presentToast(
          err.error?.message || 'Failed to accept invite',
          'danger',
        );
      },
    });
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger',
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
