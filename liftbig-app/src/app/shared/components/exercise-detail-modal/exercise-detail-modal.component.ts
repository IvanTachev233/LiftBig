import { Component, Input, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { IonicModule, ModalController } from '@ionic/angular';
import { Exercise } from '../../../core/workout.service';
import { ParsedVideo, parseVideoUrl } from './video-url';

@Component({
  selector: 'app-exercise-detail-modal',
  templateUrl: './exercise-detail-modal.component.html',
  styleUrls: ['./exercise-detail-modal.component.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class ExerciseDetailModalComponent {
  private modalCtrl = inject(ModalController);
  private sanitizer = inject(DomSanitizer);

  private _exercise!: Exercise;
  video: ParsedVideo | null = null;
  embedUrl: SafeResourceUrl | null = null;

  @Input({ required: true })
  set exercise(value: Exercise) {
    this._exercise = value;
    this.video = parseVideoUrl(value?.videoUrl);
    this.embedUrl = this.buildEmbedUrl(this.video);
  }
  get exercise(): Exercise {
    return this._exercise;
  }

  get description(): string {
    return this._exercise?.description?.trim() ?? '';
  }

  close() {
    return this.modalCtrl.dismiss(null, 'cancel');
  }

  // Only a fixed prefix plus an id that passed the strict pattern is trusted;
  // the user's URL itself never reaches the iframe
  private buildEmbedUrl(video: ParsedVideo | null): SafeResourceUrl | null {
    if (video?.kind === 'youtube') {
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.youtube.com/embed/' + video.id,
      );
    }
    if (video?.kind === 'vimeo') {
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://player.vimeo.com/video/' + video.id,
      );
    }
    return null;
  }
}
