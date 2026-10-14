import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';

/** Sheet for a card's note for the athlete; confirms with the trimmed text ('' clears it) */
@Component({
  selector: 'app-card-note-sheet',
  template: `
    <app-bottom-sheet
      title="Note for athlete"
      [helper]="helper"
      primaryLabel="Save"
      (primary)="save()"
    >
      <label class="note-label" for="card-note-field">Note</label>
      <textarea
        id="card-note-field"
        class="note-field"
        rows="3"
        placeholder="e.g. Pause 2 s at the bottom"
        [(ngModel)]="text"
      ></textarea>
    </app-bottom-sheet>
  `,
  styles: `
    .note-label {
      display: block;
      margin-bottom: 8px;
      color: var(--text-soft);
      font-size: 13px;
      font-weight: 500;
    }

    .note-field {
      box-sizing: border-box;
      width: 100%;
      min-height: 96px;
      margin-bottom: 16px;
      padding: 12px 16px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-md);
      background: var(--surface-input);
      color: var(--text);
      font: 16px var(--font-ui);
      resize: vertical;

      &::placeholder {
        color: var(--placeholder);
      }

      &:focus {
        outline: none;
        box-shadow: 0 0 0 1.5px var(--accent);
      }
    }
  `,
  standalone: true,
  imports: [BottomSheetComponent, FormsModule],
})
export class CardNoteSheetComponent implements OnInit {
  private modalController = inject(ModalController);

  @Input() exerciseName = '';
  @Input() note = '';

  text = '';

  get helper(): string {
    return `Shown under ${this.exerciseName} in the athlete's workout.`;
  }

  ngOnInit() {
    this.text = this.note;
  }

  save() {
    this.modalController.dismiss(this.text.trim(), 'confirm');
  }
}
