import { Component, input } from '@angular/core';
import { IonicModule } from '@ionic/angular';

/**
 * The 28px title at the top of a tab root's content, as an iOS collapsing
 * large title; projected [intro] content sits above it. Place it first in
 * ion-content, with TabHeaderComponent above the content.
 */
@Component({
  selector: 'app-large-title',
  template: `
    <ion-header collapse="condense" class="large-title ion-no-border">
      <ng-content select="[intro]" />
      <ion-toolbar>
        <ion-title size="large" role="heading" aria-level="1">{{ title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
  `,
  standalone: true,
  imports: [IonicModule],
  host: { style: 'display: contents' },
})
export class LargeTitleComponent {
  readonly title = input.required<string>();
}
