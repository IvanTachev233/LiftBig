import { Component, inject } from '@angular/core';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { ActiveWorkoutService } from '../../core/active-workout.service';
import { ResumeBarComponent } from '../../shared/components/resume-bar/resume-bar.component';

@Component({
  selector: 'app-athlete-tabs',
  templateUrl: './athlete-tabs.page.html',
  styleUrls: ['./tabs.scss'],
  standalone: true,
  imports: [IonicModule, ResumeBarComponent],
})
export class AthleteTabsPage implements ViewWillEnter {
  private activeWorkout = inject(ActiveWorkoutService);

  // Also runs on return from the logger, whether minimised or completed
  ionViewWillEnter() {
    this.activeWorkout.refresh();
  }

  onTabChange() {
    this.activeWorkout.refresh();
  }
}
