import { Component, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { CreateExerciseDto, WorkoutService } from '../../../core/workout.service';
import { isHttpsUrl } from '../exercise-detail-modal/video-url';

@Component({
  selector: 'app-create-exercise-modal',
  templateUrl: './create-exercise-modal.component.html',
  styleUrls: ['./create-exercise-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule],
})
export class CreateExerciseModalComponent {
  private modalCtrl = inject(ModalController);
  private toastController = inject(ToastController);
  private workoutService = inject(WorkoutService);

  name = '';
  description = '';
  videoUrl = '';

  nameError = '';
  videoUrlError = '';
  saving = false;

  get canSave(): boolean {
    return this.name.trim().length > 0 && !this.saving;
  }

  onNameChange() {
    this.nameError = '';
  }

  onVideoUrlChange() {
    this.videoUrlError = '';
  }

  cancel() {
    return this.modalCtrl.dismiss(null, 'cancel');
  }

  save() {
    if (!this.canSave) return;

    const name = this.name.trim();
    const description = this.description.trim();
    const videoUrl = this.videoUrl.trim();

    if (videoUrl && !isHttpsUrl(videoUrl)) {
      this.videoUrlError = 'Enter a full link starting with https://';
      return;
    }

    const body: CreateExerciseDto = { name };
    if (description) body.description = description;
    if (videoUrl) body.videoUrl = videoUrl;

    this.saving = true;
    this.nameError = '';
    this.workoutService.createExercise(body).subscribe({
      next: (exercise) => {
        this.saving = false;
        this.modalCtrl.dismiss(exercise, 'confirm');
      },
      error: async (err: HttpErrorResponse) => {
        this.saving = false;
        if (err.status === 409) {
          this.nameError = 'An exercise with this name already exists';
          return;
        }
        await this.presentErrorToast();
      },
    });
  }

  private async presentErrorToast() {
    const toast = await this.toastController.create({
      message: 'Failed to create exercise. Please try again.',
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
