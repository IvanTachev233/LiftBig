import { Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';

/** Sheet for the invite code from a coach; confirms with the trimmed code */
@Component({
  selector: 'app-connect-coach-sheet',
  template: `
    <app-bottom-sheet
      title="Connect a coach"
      helper="Enter the invite code your coach shared with you."
      primaryLabel="Connect"
      [primaryDisabled]="!code.trim()"
      (primary)="connect()"
    >
      <ion-input
        class="input-field invite-code-input"
        label="Invite code"
        labelPlacement="stacked"
        autocapitalize="off"
        autocomplete="off"
        [(ngModel)]="code"
      ></ion-input>
    </app-bottom-sheet>
  `,
  standalone: true,
  imports: [IonicModule, FormsModule, BottomSheetComponent],
})
export class ConnectCoachSheetComponent {
  private modalController = inject(ModalController);

  @Input() code = '';

  connect() {
    const code = this.code.trim();
    if (code) this.modalController.dismiss(code, 'confirm');
  }
}
