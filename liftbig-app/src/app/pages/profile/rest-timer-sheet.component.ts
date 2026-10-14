import { Component, Input, OnInit, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { formatRest } from '../../core/rest-time';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';
import { ChipGroupComponent, ChipOption } from '../../shared/ui/chip-group.component';

const PRESETS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

/** Sheet for the default rest time; confirms with the seconds picked */
@Component({
  selector: 'app-rest-timer-sheet',
  template: `
    <app-bottom-sheet
      title="Default rest timer"
      helper="Counts down after each set you log."
      primaryLabel="Save"
      (primary)="save()"
    >
      <app-chip-group class="wrap" label="Rest time" [options]="options" [(value)]="choice" />
    </app-bottom-sheet>
  `,
  standalone: true,
  imports: [BottomSheetComponent, ChipGroupComponent],
})
export class RestTimerSheetComponent implements OnInit {
  private modalController = inject(ModalController);

  @Input() seconds = 0;

  options: ChipOption[] = [];
  choice: string | null = null;

  ngOnInit() {
    // A stored time that isn't a preset (set through the API) stays pickable
    const times = PRESETS.includes(this.seconds)
      ? PRESETS
      : [...PRESETS, this.seconds].sort((a, b) => a - b);
    this.options = times.map((s) => ({ value: String(s), label: s ? formatRest(s) : 'Off' }));
    this.choice = String(this.seconds);
  }

  save() {
    this.modalController.dismiss(Number(this.choice), 'confirm');
  }
}
