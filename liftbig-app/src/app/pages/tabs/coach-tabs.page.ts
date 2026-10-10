import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';

// No Programs tab until coaches can author programs (D1)
@Component({
  selector: 'app-coach-tabs',
  templateUrl: './coach-tabs.page.html',
  styleUrls: ['./tabs.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class CoachTabsPage {}
