import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { ClientService } from '../../core/client.service';

@Component({
  selector: 'app-accept-invite',
  templateUrl: './accept-invite.page.html',
  styleUrls: ['./accept-invite.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
})
export class AcceptInvitePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientService = inject(ClientService);

  loading = true;
  success = false;
  errorMessage = '';

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token') || '';
    if (!token) {
      this.loading = false;
      this.errorMessage = 'No invite token provided';
      return;
    }

    this.clientService.acceptInvite(token).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        setTimeout(() => this.router.navigate(['/dashboard']), 2000);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage =
          err.error?.message || 'Failed to accept invite';
      },
    });
  }
}
