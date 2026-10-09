import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import {
  ChartConfiguration,
  ChartData,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { LiftHistory, LiftService } from '../../../core/lift.service';
import { localDay } from '../../../core/local-date';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { WeightPipe } from '../../pipes/weight.pipe';
import { e1rmPoints } from '../../e1rm';

// A logged set of the card the modal was opened from; weights in kg
export interface HistorySet {
  id: string;
  reps: number;
  weight: number | null;
  made: boolean | null;
  actualReps: number | null;
  actualWeight: number | null;
}

const MAX_REP_MAX_REPS = 3;

const dayLabel = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

// Rep max history of one exercise: latest 1/2/3RM, an e1RM chart, recording
// logged sets and adding entries by hand
@Component({
  selector: 'app-exercise-history-modal',
  templateUrl: './exercise-history-modal.component.html',
  styleUrls: ['./exercise-history-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, BaseChartDirective, WeightPipe],
  providers: [
    provideCharts({
      registerables: [LineController, LineElement, PointElement, LinearScale, Tooltip],
    }),
  ],
})
export class ExerciseHistoryModalComponent implements OnInit {
  private liftService = inject(LiftService);
  private modalCtrl = inject(ModalController);
  private toastController = inject(ToastController);
  readonly units = inject(WeightUnitService);

  @Input() exerciseId!: string;
  @Input() exerciseName = '';
  @Input() isMaxTrackable = false;
  @Input() sets: HistorySet[] = [];

  history: LiftHistory | null = null;
  // Ids of sets recorded as rep maxes, from history or this visit
  recordedSetIds = new Set<string>();
  recording = new Set<string>();

  chartData: ChartData<'line', { x: number; y: number }[]> = { datasets: [] };
  readonly chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    scales: {
      x: { type: 'linear', ticks: { callback: (value) => dayLabel(Number(value)) } },
      y: { ticks: { callback: (value) => `${value} ${this.units.unit()}` } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items) => dayLabel(items[0].parsed.x ?? 0),
          label: (item) => `e1RM ${item.parsed.y} ${this.units.unit()}`,
        },
      },
    },
  };

  newEntry: { reps: number; weight: number | null; achievedOn: string } = {
    reps: 1,
    weight: null,
    achievedOn: localDay(),
  };
  readonly today = localDay();
  adding = false;

  ngOnInit() {
    this.load();
  }

  private load() {
    this.liftService.getHistory(this.exerciseId).subscribe({
      next: (history) => {
        this.history = history;
        for (const entry of history.entries) {
          if (entry.workoutSetId) this.recordedSetIds.add(entry.workoutSetId);
        }
        this.chartData = {
          datasets: [
            {
              label: 'e1RM',
              data: e1rmPoints(history.entries).map((p) => ({
                x: p.x,
                y: this.units.toDisplay(p.y),
              })),
              borderColor: '#6366f1',
              backgroundColor: '#6366f1',
              tension: 0.2,
            },
          ],
        };
      },
      error: () => this.presentToast("Couldn't load the history"),
    });
  }

  /** Made, logged sets of 1-3 reps of a max-trackable exercise */
  get recordable(): HistorySet[] {
    if (!this.isMaxTrackable) return [];
    return this.sets.filter((set) => {
      const reps = set.actualReps ?? set.reps;
      return set.made === true && reps >= 1 && reps <= MAX_REP_MAX_REPS;
    });
  }

  setLabel(set: HistorySet): string {
    const reps = set.actualReps ?? set.reps;
    return `${reps} × ${this.units.format(set.actualWeight ?? set.weight)}`;
  }

  record(set: HistorySet) {
    if (this.recordedSetIds.has(set.id) || this.recording.has(set.id)) return;
    this.recording.add(set.id);
    this.liftService.recordFromSet(set.id).subscribe({
      next: () => {
        this.recording.delete(set.id);
        this.recordedSetIds.add(set.id);
        this.load();
      },
      error: () => {
        this.recording.delete(set.id);
        this.presentToast("Couldn't record the rep max");
      },
    });
  }

  get canAdd(): boolean {
    const { weight, achievedOn } = this.newEntry;
    return !this.adding && weight !== null && Number(weight) > 0 && !!achievedOn;
  }

  dateChanged(event: { detail: { value?: string | string[] | null } }) {
    const value = event.detail.value;
    if (typeof value === 'string') this.newEntry.achievedOn = value.slice(0, 10);
  }

  addEntry() {
    if (!this.canAdd) return;
    this.adding = true;
    this.liftService
      .recordManual({
        exerciseId: this.exerciseId,
        reps: Number(this.newEntry.reps),
        weightKg: this.units.toKg(Number(this.newEntry.weight))!,
        achievedOn: this.newEntry.achievedOn,
      })
      .subscribe({
        next: () => {
          this.adding = false;
          this.newEntry = { ...this.newEntry, weight: null };
          this.load();
        },
        error: () => {
          this.adding = false;
          this.presentToast("Couldn't add the entry");
        },
      });
  }

  close() {
    this.modalCtrl.dismiss();
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
