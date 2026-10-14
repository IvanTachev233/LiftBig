import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController, ViewWillEnter } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { EMPTY, Observable, Subject, catchError, switchMap } from 'rxjs';
import { addIcons } from 'ionicons';
import { chevronForward, mailOutline, personAddOutline } from 'ionicons/icons';
import { ClientService, Client, Invite } from '../../core/client.service';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { LargeTitleComponent } from '../../shared/ui/large-title.component';
import { ProgressBarComponent } from '../../shared/ui/progress-bar.component';
import { StatTile, StatTilesComponent } from '../../shared/ui/stat-tiles.component';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { TabHeaderComponent } from '../../shared/ui/tab-header.component';
import { initialsOf } from '../../shared/initials';
import { InviteSheetComponent } from './invite-sheet.component';

// Coach Clients tab: search, totals, client cards with their last workout and
// progress (→ Client workouts), pending invites (tap shows the code) and the
// Invite sheet
@Component({
  selector: 'app-coach-dashboard',
  templateUrl: './coach-dashboard.page.html',
  styleUrls: ['./coach-dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    TabHeaderComponent,
    LargeTitleComponent,
    ProgressBarComponent,
    StatTilesComponent,
    StatusPillComponent,
  ],
})
export class CoachDashboardPage implements ViewWillEnter {
  private clientService = inject(ClientService);
  private bottomSheet = inject(BottomSheetService);
  private toastController = inject(ToastController);

  private refreshClients = new Subject<void>();
  private refreshInvites = new Subject<void>();

  /** null until the first load */
  readonly clients = signal<Client[] | null>(null);
  readonly invites = signal<Invite[]>([]);
  readonly query = signal('');

  /** Clients whose name or email contains the search text, ignoring case */
  readonly shownClients = computed(() => {
    const q = this.query().trim().toLowerCase();
    const clients = this.clients() ?? [];
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.email].some((v) => v?.toLowerCase().includes(q)),
    );
  });

  /** Totals over every client (not the search); null without counts from the API */
  readonly tiles = computed<StatTile[] | null>(() => {
    const clients = this.clients() ?? [];
    if (!clients.length || clients.some((c) => c.assignedCount === undefined)) return null;
    const sum = (count: (c: Client) => number | undefined) =>
      clients.reduce((total, c) => total + (count(c) ?? 0), 0);
    return [
      { label: clients.length === 1 ? 'client' : 'clients', value: clients.length },
      { label: 'assigned', value: sum((c) => c.assignedCount) },
      { label: 'completed', value: sum((c) => c.completedCount) },
    ];
  });

  readonly initials = initialsOf;

  constructor() {
    addIcons({ chevronForward, mailOutline, personAddOutline });
    // A newer refresh cancels an older one still loading; the list shown
    // stays until the new one arrives, and a failed load keeps it
    this.refreshClients
      .pipe(
        switchMap(() => this.loadOrToast(this.clientService.getClients(), "Couldn't load your clients")),
        takeUntilDestroyed(),
      )
      .subscribe((clients) => this.clients.set(clients));
    this.refreshInvites
      .pipe(
        switchMap(() =>
          this.loadOrToast(this.clientService.getPendingInvites(), "Couldn't load pending invites"),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((invites) => this.invites.set(invites));
  }

  // Runs on every visit; cached pages don't re-run their constructor
  ionViewWillEnter() {
    this.refreshClients.next();
    this.refreshInvites.next();
  }

  onSearch(event: Event) {
    this.query.set((event as CustomEvent<{ value?: string | null }>).detail.value ?? '');
  }

  /** The Invite sheet; a created invite refreshes the pending list at once */
  inviteClient() {
    return this.bottomSheet.open(InviteSheetComponent, {
      label: 'Invite a client',
      props: { created: () => this.refreshInvites.next() },
    });
  }

  /** The same sheet showing a pending invite's code */
  showInvite(invite: Invite) {
    return this.bottomSheet.open(InviteSheetComponent, {
      label: 'Invite code',
      props: { invite },
    });
  }

  private loadOrToast<T>(request: Observable<T>, message: string): Observable<T> {
    return request.pipe(
      catchError(() => {
        this.presentToast(message);
        return EMPTY;
      }),
    );
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: 'danger',
      position: 'top',
    });
    await toast.present();
  }
}
