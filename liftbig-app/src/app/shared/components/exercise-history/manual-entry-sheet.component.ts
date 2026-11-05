import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { isStorableWeight, weightInputError } from '../../../core/server-limits';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { BottomSheetComponent } from '../../ui/bottom-sheet.component';

export interface ManualEntry {
  reps: number;
  // In the user's unit
  weight: number | null;
  // YYYY-MM-DD
  achievedOn: string;
}

/** Sheet for a rep max entered by hand: 1-3 reps, a weight and a day up to today */
@Component({
  selector: 'app-manual-entry-sheet',
  templateUrl: './manual-entry-sheet.component.html',
  standalone: true,
  imports: [IonicModule, FormsModule, BottomSheetComponent],
})
export class ManualEntrySheetComponent implements OnInit {
  private modalController = inject(ModalController);
  readonly units = inject(WeightUnitService);

  @Input() entry: ManualEntry = { reps: 1, weight: null, achievedOn: '' };
  /** YYYY-MM-DD; later days are not allowed */
  @Input() today = '';

  reps = '1';
  weight: number | null = null;
  achievedOn = '';

  ngOnInit() {
    this.reps = String(this.entry.reps);
    this.weight = this.entry.weight;
    this.achievedOn = this.entry.achievedOn || this.today;
  }

  /** Why the typed weight can't be stored, shown under the field; '' when it can */
  get weightError(): string {
    return weightInputError(this.weight, this.units);
  }

  get valid(): boolean {
    return (
      isStorableWeight(this.weight, this.units) &&
      !!this.achievedOn &&
      this.achievedOn <= this.today
    );
  }

  add() {
    if (!this.valid) return;
    const entry: ManualEntry = {
      reps: Number(this.reps),
      weight: Number(this.weight),
      achievedOn: this.achievedOn,
    };
    this.modalController.dismiss(entry, 'confirm');
  }
}
