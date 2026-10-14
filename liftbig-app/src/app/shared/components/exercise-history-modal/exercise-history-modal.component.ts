import { Component, Input, ViewChild, inject } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { ExerciseHistoryComponent } from '../exercise-history/exercise-history.component';

// The logger's sheet with an exercise's rep max history
@Component({
  selector: 'app-exercise-history-modal',
  templateUrl: './exercise-history-modal.component.html',
  styleUrls: ['./exercise-history-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, ExerciseHistoryComponent],
})
export class ExerciseHistoryModalComponent {
  private modalCtrl = inject(ModalController);

  @Input() exerciseId!: string;
  @Input() exerciseName = '';

  @ViewChild(ExerciseHistoryComponent) history?: ExerciseHistoryComponent;

  addEntry() {
    this.history?.openAddEntry();
  }

  close() {
    this.modalCtrl.dismiss();
  }
}
