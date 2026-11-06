import { Component, OnDestroy, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, close } from 'ionicons/icons';
import { AgreementsService } from '../../core/agreements.service';
import { BugReportService } from '../../core/bug-report.service';
import { reencodeScreenshot } from '../../core/reencode-screenshot';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';

const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;
const STEPS_MAX = 2000;
const MAX_SCREENSHOTS = 3;
const UNREADABLE_IMAGE_MESSAGE = "Couldn't add that image";

/** A picked, re-encoded screenshot and the object URL for its thumbnail */
interface Screenshot {
  blob: Blob;
  url: string;
}

/**
 * Sheet for "Report a bug" (spec § Report sheet): sends the description,
 * optional steps and up to 3 re-encoded screenshots itself, so a failure
 * keeps everything entered; confirms with true once the API accepts.
 */
@Component({
  selector: 'app-report-bug-sheet',
  templateUrl: './report-bug-sheet.component.html',
  styleUrls: ['./report-bug-sheet.component.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, BottomSheetComponent],
})
export class ReportBugSheetComponent implements OnDestroy {
  private modalController = inject(ModalController);
  private bugReportService = inject(BugReportService);
  private agreements = inject(AgreementsService);

  readonly descriptionMax = DESCRIPTION_MAX;
  readonly stepsMax = STEPS_MAX;
  readonly privacyUrl = this.agreements.documentUrl('privacy');

  description = '';
  steps = '';
  screenshots: Screenshot[] = [];
  imageError = '';
  error = '';
  saving = false;
  adding = false;

  constructor() {
    addIcons({ close, cameraOutline });
  }

  get canSend(): boolean {
    const description = this.description.trim().length;
    return (
      description >= DESCRIPTION_MIN &&
      description <= DESCRIPTION_MAX &&
      this.steps.trim().length <= STEPS_MAX
    );
  }

  get remainingSlots(): number {
    return MAX_SCREENSHOTS - this.screenshots.length;
  }

  async addScreenshots(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.imageError = '';
    this.adding = true;
    try {
      for (const file of files) {
        // Re-checked on every iteration (not sliced upfront): a second pick
        // can be re-encoding concurrently and fill the remaining slots
        // while this one is still awaiting its own re-encode
        if (this.screenshots.length >= MAX_SCREENSHOTS) break;
        try {
          const blob = await reencodeScreenshot(file);
          if (this.screenshots.length >= MAX_SCREENSHOTS) break;
          this.screenshots.push({ blob, url: URL.createObjectURL(blob) });
        } catch {
          this.imageError = UNREADABLE_IMAGE_MESSAGE;
        }
      }
    } finally {
      // Cleared only once every file is read: on Android's WebView, clearing
      // it earlier released the picked files, so the 2nd of a multi-pick failed
      input.value = '';
      this.adding = false;
    }
  }

  removeScreenshot(index: number) {
    const [removed] = this.screenshots.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.url);
  }

  send() {
    if (!this.canSend || this.saving) return;
    this.saving = true;
    this.error = '';
    this.bugReportService
      .send({
        description: this.description.trim(),
        steps: this.steps.trim(),
        screenshots: this.screenshots.map((s) => s.blob),
      })
      .subscribe({
        next: () => this.modalController.dismiss(true, 'confirm'),
        error: (err: HttpErrorResponse) => {
          this.saving = false;
          this.error = this.errorMessage(err);
        },
      });
  }

  private errorMessage(err: HttpErrorResponse): string {
    if (err.status === 429) return "You've sent a lot of reports today. Try again tomorrow.";
    if (err.status === 503) return 'Bug reports are turned off right now.';
    return "Couldn't send your report. Try again.";
  }

  ngOnDestroy() {
    for (const screenshot of this.screenshots) URL.revokeObjectURL(screenshot.url);
  }
}
