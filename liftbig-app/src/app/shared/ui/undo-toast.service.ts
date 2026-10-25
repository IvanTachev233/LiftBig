import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

/** How long Undo is offered; the delete is sent once it runs out */
export const UNDO_MS = 5000;

export interface SoftDelete {
  /** "Workout deleted" */
  title: string;
  /** "New Workout · Sat 10 Oct" */
  sub: string;
  /** Hides the item and updates totals at once */
  hide: () => void;
  /** Puts the item back: Undo, or the delete failed */
  restore: () => void;
  /** The delete request, sent when the toast runs out */
  commit: () => Observable<unknown>;
  /** After the delete succeeded, e.g. reload */
  done?: () => void;
  /** Toast text when the delete fails */
  failed?: string;
}

/**
 * Undo toast for deletes (design handoff § Destructive actions): a soft
 * delete hides the item, shows the toast above the resume bar or tab bar
 * with a 5 s countdown, and sends the delete only when it runs out. A new
 * soft delete sends a pending one at once.
 */
@Injectable({ providedIn: 'root' })
export class UndoToastService {
  private toastController = inject(ToastController);
  private current: HTMLIonToastElement | null = null;

  constructor() {
    addIcons({ trashOutline });
  }

  async softDelete(job: SoftDelete): Promise<'undone' | 'deleted' | 'failed'> {
    job.hide();
    // The previous toast's delete goes out now
    await this.current?.dismiss(undefined, 'timeout');

    const toast = await this.toastController.create({
      header: job.title,
      message: job.sub,
      icon: 'trash-outline',
      duration: UNDO_MS,
      position: 'bottom',
      positionAnchor: this.anchor(),
      cssClass: 'undo-toast',
      buttons: [{ text: 'Undo', role: 'cancel' }],
    });
    this.current = toast;
    await toast.present();
    const { role } = await toast.onDidDismiss();
    if (this.current === toast) this.current = null;

    if (role === 'cancel') {
      job.restore();
      return 'undone';
    }
    return new Promise((resolve) => {
      job.commit().subscribe({
        next: () => {
          job.done?.();
          resolve('deleted');
        },
        error: () => {
          job.restore();
          this.presentError(job.failed ?? "Couldn't delete it");
          resolve('failed');
        },
      });
    });
  }

  /** The resume bar, else the tab bar of the page on screen; none on full-screen pages */
  private anchor(): HTMLElement | undefined {
    const visible = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => {
        if (el.closest('.ion-page-hidden')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    return visible('app-resume-bar .resume-bar') ?? visible('ion-tab-bar');
  }

  private async presentError(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'top',
    });
    await toast.present();
  }
}
