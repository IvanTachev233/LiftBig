import { Component, Input, LOCALE_ID, OnInit, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';
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
import {
  LiftHistory,
  LiftRecordSource,
  LiftService,
  RepMaxEntry,
} from '../../../core/lift.service';
import { localDay } from '../../../core/local-date';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { WeightPipe } from '../../pipes/weight.pipe';
import { e1rmPoints } from '../../e1rm';

const SOURCE_LABELS: Record<LiftRecordSource, string> = {
  MANUAL: 'Manual',
  LOGGED_SET: 'Logged set',
  PROGRAM_SETUP: 'Program setup',
};

const dayLabel = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

// Rep max history of one exercise: latest 1/2/3RM, an e1RM chart, the
// entries with a remove action and adding entries by hand
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
  private alertCtrl = inject(AlertController);
  private locale = inject(LOCALE_ID);
  readonly units = inject(WeightUnitService);

  @Input() exerciseId!: string;
  @Input() exerciseName = '';

  history: LiftHistory | null = null;
  // Newest first
  entries: RepMaxEntry[] = [];
  // Ignores remove taps while one is being confirmed or sent
  private removing = false;

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
        this.entries = [...history.entries].sort(
          (a, b) =>
            b.achievedOn.localeCompare(a.achievedOn) || b.createdAt.localeCompare(a.createdAt),
        );
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

  /** e.g. "3 × 100 kg" */
  entryLabel(entry: RepMaxEntry): string {
    return `${entry.reps} × ${this.units.format(entry.weightKg)}`;
  }

  /** e.g. "Oct 5, 2026" */
  entryDate(entry: RepMaxEntry): string {
    return formatDate(entry.achievedOn, 'mediumDate', this.locale);
  }

  sourceLabel(entry: RepMaxEntry): string {
    return SOURCE_LABELS[entry.source] ?? entry.source;
  }

  /** Asks to confirm, then removes the entry and reloads the history */
  async confirmRemove(entry: RepMaxEntry) {
    if (this.removing) return;
    this.removing = true;
    const alert = await this.alertCtrl.create({
      header: 'Remove entry?',
      message: `${this.entryLabel(entry)} on ${this.entryDate(entry)} will no longer count as a personal best.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') {
      this.removing = false;
      return;
    }
    this.liftService.removeRepMax(entry.id).subscribe({
      next: () => {
        this.removing = false;
        this.load();
      },
      error: () => {
        this.removing = false;
        this.presentToast("Couldn't remove the entry");
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
