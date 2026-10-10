import { Injectable, inject } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';

export interface OverflowAction {
  id: string;
  text: string;
  /** Shown in the danger colour (Remove, Delete) */
  destructive?: boolean;
}

/** The `⋯` menu: an action sheet listing the actions, then Cancel */
@Injectable({ providedIn: 'root' })
export class OverflowMenuService {
  private actionSheetController = inject(ActionSheetController);

  /** Resolves with the chosen action's id, or null when cancelled */
  async open(actions: OverflowAction[], header?: string): Promise<string | null> {
    const sheet = await this.actionSheetController.create({
      header,
      cssClass: 'overflow-menu',
      buttons: [
        ...actions.map(({ id, text, destructive }) => ({
          text,
          ...(destructive ? { role: 'destructive' } : {}),
          data: { action: id },
        })),
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action: string }>();
    return data?.action ?? null;
  }
}
