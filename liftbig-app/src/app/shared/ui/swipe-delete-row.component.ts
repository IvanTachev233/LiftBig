import { Component, DestroyRef, ElementRef, ViewChild, inject, input, output } from '@angular/core';
import { IonicModule, IonItemSliding } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

/**
 * A list row that swipes left to reveal an inset Delete button (design
 * handoff § Destructive actions). Project the row's ion-item. A full swipe
 * acts as tapping Delete; Ionic keeps one row open at a time, and a tap
 * anywhere else closes it (a tap on the open row closes it without opening
 * the row).
 */
@Component({
  selector: 'app-swipe-delete-row',
  template: `
    <ion-item-sliding #sliding [disabled]="disabled()" (ionDrag)="watchOutsideTaps()">
      <ng-content />
      @if (!disabled()) {
        <ion-item-options side="end" (ionSwipe)="choose()">
          <ion-item-option
            class="swipe-delete"
            [expandable]="true"
            [attr.aria-label]="label()"
            (click)="choose()"
          >
            <span class="swipe-delete-inner">
              <ion-icon name="trash-outline" aria-hidden="true"></ion-icon>
              {{ text() }}
            </span>
          </ion-item-option>
        </ion-item-options>
      }
    </ion-item-sliding>
  `,
  standalone: true,
  imports: [IonicModule],
  host: { style: 'display: block' },
})
export class SwipeDeleteRowComponent {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Accessible name of the button, e.g. "Delete Day 1" */
  readonly label = input.required<string>();
  /** Visible word under the icon */
  readonly text = input('Delete');
  readonly disabled = input(false);
  /** Tapped Delete or swiped fully; the row slides closed as well */
  readonly delete = output<void>();

  @ViewChild('sliding') sliding?: IonItemSliding;

  private listening = false;
  private swallowClick = false;

  private readonly onPointerDown = (event: Event) => {
    const target = event.target as Node;
    const options = this.host.nativeElement.querySelector('ion-item-options');
    if (options?.contains(target)) return;
    this.swallowClick = false;
    // Resolves before the tap's click arrives
    this.sliding?.getOpenAmount().then((amount) => {
      if (!amount) {
        this.stopWatching();
        return;
      }
      // The tap closes the row instead of acting on what is under it
      this.swallowClick = this.host.nativeElement.contains(target);
      this.close();
    });
  };

  private readonly onClick = (event: Event) => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  constructor() {
    addIcons({ trashOutline });
    inject(DestroyRef).onDestroy(() => this.stopWatching());
  }

  /** The row slides back while the sheet or toast comes up */
  choose() {
    this.delete.emit();
    void this.close();
  }

  async close() {
    this.stopWatching();
    try {
      await this.sliding?.close();
    } catch {
      // Already closed
    }
  }

  /** Once the row is dragged, the next tap outside its button closes it */
  watchOutsideTaps() {
    if (this.listening) return;
    this.listening = true;
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('click', this.onClick, true);
  }

  private stopWatching() {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    // The click of the closing tap still has to be swallowed
    setTimeout(() => {
      if (!this.listening) document.removeEventListener('click', this.onClick, true);
    }, 400);
  }
}
