import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';

/** Sheet for the profile name; confirms with the trimmed new name */
@Component({
  selector: 'app-edit-profile-sheet',
  template: `
    <app-bottom-sheet
      title="Edit profile"
      helper="Your coach sees you by this name."
      primaryLabel="Save"
      [primaryDisabled]="!canSave"
      (primary)="save()"
    >
      <ion-input
        class="input-field name-input"
        label="Name"
        labelPlacement="stacked"
        autocomplete="name"
        autocapitalize="words"
        [maxlength]="100"
        [(ngModel)]="name"
      ></ion-input>
    </app-bottom-sheet>
  `,
  standalone: true,
  imports: [IonicModule, FormsModule, BottomSheetComponent],
})
export class EditProfileSheetComponent implements OnInit {
  private modalController = inject(ModalController);

  @Input() name = '';

  private initial = '';

  get canSave(): boolean {
    const name = this.name.trim();
    return !!name && name !== this.initial;
  }

  ngOnInit() {
    this.initial = this.name.trim();
  }

  save() {
    if (this.canSave) this.modalController.dismiss(this.name.trim(), 'confirm');
  }
}
