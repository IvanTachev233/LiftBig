import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WorkoutService, Workout } from '../../core/workout.service';
import { AuthService } from '../../core/auth.service';
import { ProgramService, Program } from '../../core/program.service';
import { ClientService } from '../../core/client.service';
import { WorkoutCardComponent } from '../../shared/components/workout-card/workout-card.component';
import { ProgramCardComponent } from '../../shared/components/program-card/program-card.component';
import { Observable } from 'rxjs';

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
    WorkoutCardComponent,
    ProgramCardComponent,
  ],
})
export class DashboardPage implements OnInit {
  private workoutService = inject(WorkoutService);
  private programService = inject(ProgramService);
  private clientService = inject(ClientService);
  private toastController = inject(ToastController);
  public authService = inject(AuthService);

  upcomingWorkouts$: Observable<Workout[]> | undefined;
  upcomingPrograms$: Observable<Program[]> | undefined;
  user = this.authService.currentUser;
  inviteToken: string = '';

  get hasCoach(): boolean {
    return !!this.user()?.coachId;
  }

  ngOnInit() {
    this.upcomingWorkouts$ = this.workoutService.getUpcoming();
    this.upcomingPrograms$ = this.programService.getUpcomingPrograms();
  }

  acceptInvite() {
    if (!this.inviteToken) return;
    this.clientService.acceptInvite(this.inviteToken).subscribe({
      next: () => {
        this.presentToast('Invite accepted! You are now linked to your coach.', 'success');
        this.inviteToken = '';
        this.upcomingPrograms$ = this.programService.getUpcomingPrograms();
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
