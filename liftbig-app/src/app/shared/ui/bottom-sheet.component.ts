import { Component, inject, input, output } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

/**
 * Layout of a sheet opened with BottomSheetService: title, helper line,
 * close ✕, the sheet's own content, and one primary button. The grabber is
 * the modal's handle.
 */
@Component({
  selector: 'app-bottom-sheet',
  templateUrl: './bottom-sheet.component.html',
  styleUrls: ['./bottom-sheet.component.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class BottomSheetComponent {
  private modalController = inject(ModalController);

  readonly title = input.required<string>();
  readonly helper = input<string>();
  readonly primaryLabel = input.required<string>();
  readonly primaryDisabled = input(false);
  readonly primary = output<void>();

  constructor() {
    addIcons({ close });
  }

  protected close() {
    this.modalController.dismiss(undefined, 'cancel');
  }
}
