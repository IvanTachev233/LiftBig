import { Component, Input, LOCALE_ID, OnInit, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import {
  AlertController,
  IonicModule,
  IonItemSliding,
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
import { BottomSheetService } from '../../ui/bottom-sheet.service';
import { StatusPillComponent } from '../../ui/status-pill.component';
import { ManualEntry, ManualEntrySheetComponent } from './manual-entry-sheet.component';

const SOURCE_LABELS: Record<LiftRecordSource, string> = {
  MANUAL: 'Manual',
  LOGGED_SET: 'Logged',
  PROGRAM_SETUP: 'Program setup',
};

export type HistoryRange = '1M' | '3M' | '6M' | 'All';

const RANGE_MONTHS: Record<HistoryRange, number | null> = {
  '1M': 1,
  '3M': 3,
  '6M': 6,
  All: null,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// x values are UTC midnight of the entry's day
const monthLabel = (time: number) => MONTHS[new Date(time).getUTCMonth()];
const dayLabel = (time: number) =>
  new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Rep max history of one exercise: the best estimated 1RM of a range with
 * its change, a chart, the latest 1/2/3RM, the entries (swipe to remove) and
 * adding an entry in a sheet. Shown by the Exercise detail page and the
 * logger's history modal.
 */
@Component({
  selector: 'app-exercise-history',
  templateUrl: './exercise-history.component.html',
  styleUrls: ['./exercise-history.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, BaseChartDirective, WeightPipe, StatusPillComponent],
  providers: [
    provideCharts({
      registerables: [LineController, LineElement, PointElement, LinearScale, Tooltip],
    }),
  ],
})
export class ExerciseHistoryComponent implements OnInit {
  private liftService = inject(LiftService);
  private toastController = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private bottomSheet = inject(BottomSheetService);
  private locale = inject(LOCALE_ID);
  readonly units = inject(WeightUnitService);

  @Input() exerciseId!: string;

  /** The device clock; specs replace it */
  now: () => Date = () => new Date();

  readonly ranges: HistoryRange[] = ['1M', '3M', '6M', 'All'];
  range: HistoryRange = '6M';

  history: LiftHistory | null = null;
  // Newest first
  entries: RepMaxEntry[] = [];
  // The entry the 1RM best comes from
  bestEntryId: string | null = null;
  // Highest e1RM of the range, and its change since the range's first point (kg)
  hero: number | null = null;
  delta: { kg: number; since: string } | null = null;
  // Ignores remove taps while one is being confirmed or sent
  private removing = false;

  chartData: ChartData<'line', { x: number; y: number }[]> = { datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = {};

  newEntry: ManualEntry = { reps: 1, weight: null, achievedOn: localDay() };
  adding = false;

  ngOnInit() {
    this.load(true);
  }

  private load(first = false) {
    this.liftService.getHistory(this.exerciseId).subscribe({
      next: (history) => {
        this.history = history;
        this.entries = [...history.entries].sort(
          (a, b) =>
            b.achievedOn.localeCompare(a.achievedOn) || b.createdAt.localeCompare(a.createdAt),
        );
        this.bestEntryId = this.findBestEntry(history);
        // Opens on a range that has points
        if (first && this.inRange('6M').length === 0) this.range = 'All';
        this.refresh();
      },
      error: () => this.presentToast("Couldn't load the history"),
    });
  }

  setRange(value: unknown) {
    if (value === this.range || !this.ranges.includes(value as HistoryRange)) return;
    this.range = value as HistoryRange;
    this.refresh();
  }

  /** The range's entries; All keeps every one */
  private inRange(range: HistoryRange): RepMaxEntry[] {
    const months = RANGE_MONTHS[range];
    if (months === null) return this.history?.entries ?? [];
    const now = this.now();
    const cutoff = localDay(new Date(now.getFullYear(), now.getMonth() - months, now.getDate()));
    return (this.history?.entries ?? []).filter((e) => e.achievedOn >= cutoff);
  }

  private refresh() {
    const points = e1rmPoints(this.inRange(this.range));
    this.hero = points.length ? Math.max(...points.map((p) => p.y)) : null;
    const now = this.now();
    const first = points[0] ? new Date(points[0].x) : null;
    // A start in the current month reads "Oct 7", an earlier one "May"
    const sameMonth =
      !!first &&
      first.getUTCFullYear() === now.getFullYear() &&
      first.getUTCMonth() === now.getMonth();
    this.delta =
      points.length > 1 && this.hero !== null
        ? { kg: this.hero - points[0].y, since: (sameMonth ? dayLabel : monthLabel)(points[0].x) }
        : null;
    // Ticks name days when the points span under two months
    const span = points.length ? points[points.length - 1].x - points[0].x : 0;
    const tickLabel = span < 60 * 24 * 60 * 60 * 1000 ? dayLabel : monthLabel;

    // The canvas can't read CSS variables, so take the tokens' values
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const [accent, line, text, bg] = ['--accent', '--line', '--text-3', '--surface'].map(token);
    this.chartData = {
      datasets: [
        {
          label: 'e1RM',
          data: points.map((p) => ({ x: p.x, y: this.units.toDisplay(p.y) })),
          borderColor: accent,
          borderWidth: 2.5,
          pointBackgroundColor: bg,
          pointBorderColor: accent,
          pointBorderWidth: 2,
          pointRadius: 4,
          tension: 0,
        },
      ],
    };
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          grid: { display: false },
          border: { display: false },
          ticks: { color: text, maxTicksLimit: 5, callback: (value) => tickLabel(Number(value)) },
        },
        y: {
          grid: { color: line },
          border: { display: false },
          ticks: { color: text, maxTicksLimit: 4 },
        },
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
  }

  /** e.g. "+8 kg since May" */
  get deltaLabel(): string {
    if (!this.delta) return '';
    // The hero is the range's highest point, so the change is never below 0
    const value = this.units.toDisplay(this.delta.kg);
    if (value <= 0) return `No change since ${this.delta.since}`;
    return `+${value} ${this.units.unit()} since ${this.delta.since}`;
  }

  /** The 1-rep entry the best comes from: same weight and day, earliest recorded */
  private findBestEntry(history: LiftHistory): string | null {
    const best = history.best;
    if (!best) return null;
    const matches = history.entries
      .filter(
        (e) => e.reps === 1 && e.weightKg === best.weightKg && e.achievedOn === best.achievedOn,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return matches[0]?.id ?? null;
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
  async confirmRemove(entry: RepMaxEntry, slider?: IonItemSliding) {
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
      await this.close(slider);
      return;
    }
    this.liftService.removeRepMax(entry.id).subscribe({
      next: () => {
        this.removing = false;
        this.load();
      },
      error: () => {
        this.removing = false;
        this.close(slider);
        this.presentToast("Couldn't remove the entry");
      },
    });
  }

  private async close(slider?: IonItemSliding) {
    try {
      await slider?.close();
    } catch {
      // Already closed
    }
  }

  get canAdd(): boolean {
    const { weight, achievedOn } = this.newEntry;
    return (
      !this.adding &&
      weight !== null &&
      Number(weight) > 0 &&
      !!achievedOn &&
      achievedOn <= localDay(this.now())
    );
  }

  /** The "+" sheet: reps, weight and date; adds the entry on confirm */
  async openAddEntry() {
    const { data, role } = await this.bottomSheet.open<ManualEntry>(ManualEntrySheetComponent, {
      label: 'Add entry',
      props: { entry: { ...this.newEntry, weight: null }, today: localDay(this.now()) },
    });
    if (role !== 'confirm' || !data) return;
    this.newEntry = data;
    this.addEntry();
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

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
