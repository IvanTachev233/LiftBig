import { Component, Injectable, Injector, Input, TemplateRef, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { flagOutline, personRemoveOutline, trashOutline, trophyOutline } from 'ionicons/icons';

export interface ConfirmSheetOptions {
  /** "Delete this workout?" */
  title: string;
  /** One line on the consequence */
  message: string;
  /** "Delete workout" */
  confirmLabel: string;
  /** Icon in the danger circle; trash by default */
  icon?: string;
  /** The item as its list row; rendered with `summaryContext` as $implicit */
  summary?: TemplateRef<unknown>;
  summaryContext?: unknown;
  /** A row under the summary, e.g. "Includes your Bench Press PR · 123 kg" */
  warning?: string;
}

/**
 * Confirm sheet for destructive actions (design handoff § Destructive
 * actions): danger icon, title, consequence, a summary of the item, an
 * optional PR warning, then the danger button over Cancel.
 */
@Component({
  selector: 'app-confirm-sheet',
  template: `
    <div class="confirm-sheet">
      <div class="confirm-head">
        <span class="danger-circle" aria-hidden="true"><ion-icon [name]="icon"></ion-icon></span>
        <div class="confirm-text">
          <h2 class="confirm-title">{{ title }}</h2>
          <p class="confirm-message">{{ message }}</p>
        </div>
      </div>
      @if (summary || warning) {
        <div class="confirm-summary">
          @if (summary) {
            <div class="confirm-summary-row">
              <ng-container *ngTemplateOutlet="summary; context: { $implicit: summaryContext }" />
            </div>
          }
          @if (warning) {
            <div class="confirm-warning">
              <ion-icon name="trophy-outline" aria-hidden="true"></ion-icon>
              {{ warning }}
            </div>
          }
        </div>
      }
      <div class="confirm-actions">
        <button type="button" class="confirm-btn" (click)="confirm()">{{ confirmLabel }}</button>
        <button type="button" class="cancel-btn" (click)="cancel()">Cancel</button>
      </div>
    </div>
  `,
  standalone: true,
  imports: [IonicModule, NgTemplateOutlet],
})
export class ConfirmSheetComponent {
  private modalController = inject(ModalController);

  @Input() title = '';
  @Input() message = '';
  @Input() confirmLabel = 'Delete';
  @Input() icon = 'trash-outline';
  @Input() summary?: TemplateRef<unknown>;
  @Input() summaryContext?: unknown;
  @Input() warning?: string;

  constructor() {
    addIcons({ flagOutline, personRemoveOutline, trashOutline, trophyOutline });
  }

  confirm() {
    this.modalController.dismiss(true, 'confirm');
  }

  cancel() {
    this.modalController.dismiss(false, 'cancel');
  }
}

/** Opens the confirm sheet; resolves true only for the danger button */
@Injectable({ providedIn: 'root' })
export class ConfirmSheetService {
  // Resolved on use, so rows that only might delete don't need Ionic's overlay setup
  private injector = inject(Injector);

  async confirm(options: ConfirmSheetOptions): Promise<boolean> {
    const modal = await this.injector.get(ModalController).create({
      component: ConfirmSheetComponent,
      componentProps: { ...options },
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: true,
      cssClass: ['bottom-sheet', 'confirm-sheet-modal'],
      // The dialog role sits in the modal's shadow DOM, which only inherits aria-label
      htmlAttributes: { 'aria-label': options.title },
    });
    await modal.present();
    // Backdrop tap and drag down dismiss without a role: cancel
    const { role } = await modal.onDidDismiss();
    return role === 'confirm';
  }
}
