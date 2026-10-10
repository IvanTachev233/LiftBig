import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import {
  Enrollment,
  ProgramService,
  ProgramSummary,
  Sport,
} from '../../core/program.service';

// One tab per sport from the API, listing its published programs
@Component({
  selector: 'app-programs',
  templateUrl: './programs.page.html',
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
})
export class ProgramsPage implements ViewWillEnter {
  private programService = inject(ProgramService);

  sports: Sport[] | null = null;
  selectedSportId: string | null = null;
  programs: ProgramSummary[] | null = null;
  active: Enrollment | null = null;
  failed = false;

  ionViewWillEnter() {
    this.programService.getActive().subscribe({
      next: ({ active }) => (this.active = active),
      error: () => (this.active = null),
    });
    this.loadSports();
  }

  loadSports() {
    this.failed = false;
    this.programService.getSports().subscribe({
      next: (sports) => {
        this.sports = sports;
        const kept = sports.find((s) => s.id === this.selectedSportId);
        const first = kept ?? sports[0];
        if (first) this.selectSport(first.id);
      },
      error: () => (this.failed = true),
    });
  }

  selectSport(sportId: string) {
    this.selectedSportId = sportId;
    this.programs = null;
    this.failed = false;
    this.programService.getPrograms(sportId).subscribe({
      next: (programs) => {
        if (this.selectedSportId === sportId) this.programs = programs;
      },
      error: () => (this.failed = true),
    });
  }
}
