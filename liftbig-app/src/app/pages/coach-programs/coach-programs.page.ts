import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { ProgramService, Program } from '../../core/program.service';
import { ProgramCardComponent } from '../../shared/components/program-card/program-card.component';
import { Observable, BehaviorSubject, switchMap } from 'rxjs';

@Component({
  selector: 'app-coach-programs',
  templateUrl: './coach-programs.page.html',
  styleUrls: ['./coach-programs.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, ProgramCardComponent],
})
export class CoachProgramsPage implements OnInit {
  private route = inject(ActivatedRoute);
  private programService = inject(ProgramService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  clientId: string = '';
  private refreshTrigger = new BehaviorSubject<void>(undefined);
  programs$: Observable<Program[]> | undefined;

  ngOnInit() {
    this.clientId = this.route.snapshot.paramMap.get('clientId') || '';
    this.programs$ = this.refreshTrigger.pipe(
      switchMap(() => this.programService.getClientPrograms(this.clientId)),
    );
  }

  async deleteProgram(program: Program, event: Event) {
    event.stopPropagation();
    const alert = await this.alertController.create({
      header: 'Delete Program',
      message: `Delete "${program.name}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.programService.deleteProgram(program.id).subscribe({
              next: () => {
                this.presentToast('Program deleted', 'success');
                this.refreshTrigger.next();
              },
              error: () => this.presentToast('Failed to delete', 'danger'),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger',
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
