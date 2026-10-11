import { Component, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import {
  Enrollment,
  ProgramService,
  ProgramSummary,
  Sport,
} from '../../core/program.service';
import { localDay } from '../../core/local-date';
import { ChipGroupComponent, ChipOption } from '../../shared/ui/chip-group.component';
import { ProgressBarComponent } from '../../shared/ui/progress-bar.component';

const DAY_MS = 24 * 60 * 60 * 1000;

// The active program, then the published programs of the chosen sport
@Component({
  selector: 'app-programs',
  templateUrl: './programs.page.html',
  styleUrls: ['./programs.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, ChipGroupComponent, ProgressBarComponent],
})
export class ProgramsPage implements ViewWillEnter {
  private programService = inject(ProgramService);

  /** The device clock; specs replace it */
  now: () => Date = () => new Date();

  sports: Sport[] | null = null;
  selectedSportId: string | null = null;
  programs: ProgramSummary[] | null = null;
  active: Enrollment | null = null;
  failed = false;

  ionViewWillEnter() {
    this.programService.getActive().subscribe({
      next: ({ active }) => (this.active = active?.status === 'ACTIVE' ? active : null),
      error: () => (this.active = null),
    });
    this.loadSports();
  }

  get sportChips(): ChipOption[] {
    return (this.sports ?? []).map((s) => ({ value: s.id, label: s.name }));
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

  selectSport(sportId: string | null) {
    if (!sportId) return;
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

  completed(enrollment: Enrollment): number {
    return enrollment.workouts.filter((w) => w.status === 'COMPLETED').length;
  }

  /** "Week 2 of 4 · next: Mon 12 Oct"; the next session is today or later */
  weekLine(enrollment: Enrollment): string {
    const now = this.now();
    const today = localDay(now);
    const days = Math.round((Date.parse(today) - Date.parse(enrollment.startDate)) / DAY_MS);
    const weeks = enrollment.program.durationWeeks;
    const week = Math.min(weeks, Math.max(1, Math.floor(days / 7) + 1));
    const next = enrollment.workouts
      .map((w) => ({ w, day: w.date.slice(0, 10) }))
      .filter(({ w, day }) => w.status !== 'COMPLETED' && day >= today)
      .sort((a, b) => a.day.localeCompare(b.day))[0];
    let line = `Week ${week} of ${weeks}`;
    if (next) {
      const tomorrow = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      const when =
        next.day === today
          ? 'today'
          : next.day === tomorrow
            ? 'tomorrow'
            : formatDate(next.day, 'EEE d MMM', 'en-US');
      line += ` · next: ${when}`;
    }
    return line;
  }
}
