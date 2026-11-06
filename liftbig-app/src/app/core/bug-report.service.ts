import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

/** Added to every report, without asking (spec § Report sheet); never the user's role */
export interface DeviceContext {
  appVersion: string;
  versionCode: string;
  platform: 'android' | 'ios' | 'web';
  osVersion: string;
  deviceModel: string;
}

/** The device and app info a bug report sends; specs replace it with a fake */
export interface BugReportPlatform {
  context(): Promise<DeviceContext>;
}

export const BUG_REPORT_PLATFORM = new InjectionToken<BugReportPlatform>('BUG_REPORT_PLATFORM', {
  providedIn: 'root',
  factory: () => ({
    context: async () => {
      const device = await Device.getInfo();
      // App.getInfo() isn't implemented on web; version and build stay blank there
      let appVersion = '';
      let versionCode = '';
      try {
        const info = await App.getInfo();
        appVersion = info.version;
        versionCode = info.build;
      } catch {
        // Not implemented on this platform
      }
      return {
        appVersion,
        versionCode,
        platform: Capacitor.getPlatform() as DeviceContext['platform'],
        osVersion: device.osVersion,
        deviceModel: device.model,
      };
    },
  }),
});

export interface BugReportDraft {
  description: string;
  steps: string;
  screenshots: Blob[];
}

/**
 * Posts a bug report to the API: the description, steps, device context
 * (never the user's role, which the API derives from the signed-in account)
 * and up to 3 already re-encoded screenshots, as multipart form data.
 */
@Injectable({ providedIn: 'root' })
export class BugReportService {
  private http = inject(HttpClient);
  private platform = inject(BUG_REPORT_PLATFORM);
  private url = `${environment.apiUrl}/bug-reports`;

  send(draft: BugReportDraft): Observable<{ id: string }> {
    return from(this.platform.context()).pipe(
      switchMap((context) =>
        this.http.post<{ id: string }>(this.url, this.toFormData(draft, context)),
      ),
    );
  }

  private toFormData(draft: BugReportDraft, context: DeviceContext): FormData {
    const form = new FormData();
    form.set('description', draft.description);
    if (draft.steps) form.set('steps', draft.steps);
    form.set('appVersion', context.appVersion);
    form.set('versionCode', context.versionCode);
    form.set('platform', context.platform);
    form.set('osVersion', context.osVersion);
    form.set('deviceModel', context.deviceModel);
    draft.screenshots.forEach((blob, i) =>
      form.append('screenshots', blob, `screenshot-${i + 1}.jpg`),
    );
    return form;
  }
}
