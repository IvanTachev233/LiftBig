import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Client {
  id: string;
  email: string;
  role: string;
}

export interface Invite {
  id: string;
  coachId: string;
  clientEmail: string;
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class ClientService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;

  getClients() {
    return this.http.get<Client[]>(`${this.apiUrl}/clients`);
  }

  sendInvite(email: string) {
    return this.http.post<Invite>(`${this.apiUrl}/invites`, { email });
  }

  getPendingInvites() {
    return this.http.get<Invite[]>(`${this.apiUrl}/invites`);
  }

  acceptInvite(token: string) {
    return this.http.post(`${this.apiUrl}/invites/${token}/accept`, {});
  }

  removeClient(clientId: string) {
    return this.http.delete(`${this.apiUrl}/clients/${clientId}`);
  }
}
