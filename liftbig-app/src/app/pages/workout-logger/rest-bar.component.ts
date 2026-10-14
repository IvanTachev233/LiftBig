import { Component, input } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { RestTimer, formatRest } from '../../core/rest-time';

/** The logger's running rest: countdown, +15s and Skip */
@Component({
  selector: 'app-rest-bar',
  template: `
    @if (timer().remaining(); as left) {
      <div class="rest-bar" role="group" aria-label="Rest timer">
        <ion-icon class="rest-icon" name="timer-outline" aria-hidden="true"></ion-icon>
        <span class="rest-text">
          <span class="rest-label">Rest</span>
          <span class="rest-time num" role="timer">{{ format(left) }}</span>
        </span>
        <button type="button" class="rest-add" (click)="timer().add(15)">+15s</button>
        <button type="button" class="rest-skip" (click)="timer().stop()">Skip</button>
      </div>
    }
  `,
  styleUrls: ['./rest-bar.component.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class RestBarComponent {
  readonly timer = input.required<RestTimer>();

  protected readonly format = formatRest;
}
