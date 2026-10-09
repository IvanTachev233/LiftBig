import { Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, IonItemSliding, AlertController, ToastController } from '@ionic/angular';
import {
  WorkoutService,
  Workout,
  isPlanLocked,
} from '../../../core/workout.service';
import { WorkoutCardComponent } from '../workout-card/workout-card.component';

@Component({
  selector: 'app-workout-list-item',
  templateUrl: './workout-list-item.component.html',
  styleUrls: ['./workout-list-item.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, WorkoutCardComponent],
})
export class WorkoutListItemComponent {
  @Input() workout!: Workout;
  @Output() deleted = new EventEmitter<string>();

  @ViewChild('slidingItem') slidingItem!: IonItemSliding;

  private workoutService = inject(WorkoutService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  // Ignores Delete taps while a delete is already in progress
  private deleting = false;

  // Coach and program workouts can't be deleted here
  get isLocked(): boolean {
    return isPlanLocked(this.workout);
  }

  async confirmDelete() {
    if (this.deleting || this.isLocked) return;
    this.deleting = true;

    const alert = await this.alertController.create({
      header: 'Delete workout?',
      message: `This will permanently delete "${this.workout.name}".`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();

    if (role !== 'destructive' && role !== 'confirm') {
      await this.closeSlidingItem();
      this.deleting = false;
      return;
    }

    this.workoutService.deleteWorkout(this.workout.id).subscribe({
      next: async () => {
        await this.closeSlidingItem();
        this.deleted.emit(this.workout.id);
        this.deleting = false;
      },
      error: async () => {
        await this.closeSlidingItem();
        await this.presentErrorToast();
        this.deleting = false;
      },
    });
  }

  private async closeSlidingItem() {
    try {
      await this.slidingItem?.close();
    } catch {
      // Slider was already closed
    }
  }

  private async presentErrorToast() {
    const toast = await this.toastController.create({
      message: 'Failed to delete workout. Please try again.',
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
