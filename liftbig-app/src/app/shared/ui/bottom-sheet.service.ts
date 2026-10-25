import { Injectable, Type, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';

export interface BottomSheetOptions {
  /** Accessible name of the dialog; use the sheet's title */
  label: string;
  /** Inputs of the sheet component */
  props?: Record<string, unknown>;
}

export interface BottomSheetResult<R> {
  data?: R;
  /** 'cancel' from the ✕, 'backdrop' or 'gesture' when swiped away */
  role?: string;
}

/**
 * Opens a component as a bottom sheet sized to its content. The component
 * lays itself out with <app-bottom-sheet> and closes with ModalController.
 */
@Injectable({ providedIn: 'root' })
export class BottomSheetService {
  private modalController = inject(ModalController);

  async open<R = unknown>(
    component: Type<unknown>,
    options: BottomSheetOptions,
  ): Promise<BottomSheetResult<R>> {
    const modal = await this.modalController.create({
      component,
      componentProps: options.props,
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: true,
      cssClass: 'bottom-sheet',
      // The dialog role sits in the modal's shadow DOM, which only inherits aria-label
      htmlAttributes: { 'aria-label': options.label },
    });
    await modal.present();
    return modal.onDidDismiss<R>();
  }
}
