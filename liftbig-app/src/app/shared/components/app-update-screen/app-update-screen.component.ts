import { Component, HostListener, effect, inject, untracked } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  IonicModule,
  LoadingController,
  ModalController,
  PopoverController,
  ToastController,
} from '@ionic/angular';
import { AppUpdateService, PLAY_STORE_URL } from '../../../core/app-update.service';

/**
 * "Update LiftBig" over the whole app: blocking below the minimum version,
 * with Not now below the latest. Update opens the Play Store listing
 * (Capacitor opens external links outside the app).
 *
 * Ionic puts its dialogs next to the pages, not inside them, so the blocking
 * screen would only cover them: keyboard and screen reader users could still
 * reach them. While it shows, every open dialog is closed, and so is any that
 * opens later.
 */
@Component({
  selector: 'app-update-screen',
  templateUrl: './app-update-screen.component.html',
  styleUrls: ['./app-update-screen.component.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class AppUpdateScreenComponent {
  private updates = inject(AppUpdateService);
  private overlays = [
    inject(ModalController),
    inject(AlertController),
    inject(ActionSheetController),
    inject(PopoverController),
    inject(LoadingController),
    inject(ToastController),
  ];
  private closing: Promise<void> = Promise.resolve();
  readonly state = this.updates.state;
  readonly storeUrl = PLAY_STORE_URL;

  constructor() {
    effect(() => {
      if (this.state() === 'required') untracked(() => this.closeDialogs());
    });
  }

  dismiss() {
    this.updates.dismiss();
  }

  @HostListener('document:ionModalDidPresent')
  @HostListener('document:ionAlertDidPresent')
  @HostListener('document:ionActionSheetDidPresent')
  @HostListener('document:ionPopoverDidPresent')
  @HostListener('document:ionLoadingDidPresent')
  @HostListener('document:ionToastDidPresent')
  onDialogPresented() {
    if (this.state() === 'required') this.closeDialogs();
  }

  // One run at a time; a dialog that won't close (canDismiss) is left open
  private closeDialogs() {
    this.closing = this.closing
      .then(async () => {
        for (const controller of this.overlays) {
          for (let top = await controller.getTop(); top; top = await controller.getTop()) {
            if (!(await top.dismiss(undefined, 'app-update'))) break;
          }
        }
      })
      .catch(() => undefined);
  }
}
