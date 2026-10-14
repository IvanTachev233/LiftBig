import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { WeightUnitService } from '../../core/weight-unit.service';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';

/** Sheet with a 1RM per program lift; confirms with the edited maxes */
@Component({
  selector: 'app-recalculate-sheet',
  template: `
    <app-bottom-sheet
      title="Update 1RMs"
      helper="Planned sessions get new targets. Started and completed ones stay as they are."
      primaryLabel="Update planned targets"
      [primaryDisabled]="!valid"
      (primary)="confirm()"
    >
      <div class="maxes-grid">
        @for (lift of lifts; track lift.id) {
          <ion-input
            type="number"
            inputmode="decimal"
            class="input-field max-input num"
            labelPlacement="stacked"
            placeholder="—"
            [label]="lift.label"
            [(ngModel)]="maxes[lift.id]"
          >
            <span slot="end" class="unit-suffix">{{ units.unit() }}</span>
          </ion-input>
        }
      </div>
    </app-bottom-sheet>
  `,
  styles: `
    .maxes-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 10px;
    }

    .max-input {
      font-size: 21px;
      font-weight: 600;
    }

    .unit-suffix {
      font: 400 13px var(--font-ui);
      color: var(--text-2);
    }
  `,
  standalone: true,
  imports: [IonicModule, FormsModule, BottomSheetComponent],
})
export class RecalculateSheetComponent {
  private modalController = inject(ModalController);
  readonly units = inject(WeightUnitService);

  /** In the sport's order */
  @Input() lifts: { id: string; label: string }[] = [];
  /** 1RM per lift id in the user's unit; prefilled while the sheet is open */
  @Input() maxes: Record<string, number | null> = {};

  get valid(): boolean {
    return this.lifts.every((l) => this.maxes[l.id] !== null && Number(this.maxes[l.id]) > 0);
  }

  confirm() {
    if (this.valid) this.modalController.dismiss(this.maxes, 'confirm');
  }
}
