import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ToastController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ClientService, Client, Invite } from '../../core/client.service';
import { Observable, BehaviorSubject, switchMap } from 'rxjs';

@Component({
  selector: 'app-coach-dashboard',
  templateUrl: './coach-dashboard.page.html',
  styleUrls: ['./coach-dashboard.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class CoachDashboardPage implements OnInit {
  public authService = inject(AuthService);
  private clientService = inject(ClientService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  private refreshTrigger = new BehaviorSubject<void>(undefined);
  clients$: Observable<Client[]> | undefined;
  pendingInvites$: Observable<Invite[]> | undefined;

  user = this.authService.currentUser;

  ngOnInit() {
    this.clients$ = this.refreshTrigger.pipe(
      switchMap(() => this.clientService.getClients()),
    );
    this.pendingInvites$ = this.refreshTrigger.pipe(
      switchMap(() => this.clientService.getPendingInvites()),
    );
  }

  async inviteClient() {
    const alert = await this.alertController.create({
      header: 'Invite Client',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'Client email address',
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Send Invite',
          handler: (data) => {
            if (data.email) {
              this.clientService.sendInvite(data.email).subscribe({
                next: (invite) => {
                  this.showInviteToken(invite.token);
                  this.refreshTrigger.next();
                },
                error: (err) => {
                  this.presentToast(
                    err.error?.message || 'Failed to send invite',
                    'danger',
                  );
                },
              });
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async removeClient(clientId: string) {
    const alert = await this.alertController.create({
      header: 'Remove Client',
      message: 'Are you sure you want to remove this client?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            this.clientService.removeClient(clientId).subscribe({
              next: () => {
                this.presentToast('Client removed', 'success');
                this.refreshTrigger.next();
              },
              error: () => {
                this.presentToast('Failed to remove client', 'danger');
              },
            });
          },
        },
      ],
    });
    await alert.present();
  }

  async showInviteToken(token: string) {
    const alert = await this.alertController.create({
      header: 'Invite Created',
      message: `Share this code with your client:`,
      inputs: [
        {
          name: 'token',
          type: 'text',
          value: token,
          attributes: { readonly: true },
        },
      ],
      buttons: [
        {
          text: 'Copy',
          handler: () => {
            navigator.clipboard.writeText(token);
            this.presentToast('Code copied to clipboard', 'success');
            return false; // keep alert open
          },
        },
        { text: 'Done' },
      ],
    });
    await alert.present();
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger' = 'danger',
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
