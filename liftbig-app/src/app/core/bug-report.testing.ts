import { BugReportPlatform, DeviceContext } from './bug-report.service';

/** A fixed device context, replacing the real Capacitor plugins in specs */
export class FakeBugReportPlatform implements BugReportPlatform {
  deviceContext: DeviceContext = {
    appVersion: '1.2.3',
    versionCode: '42',
    platform: 'android',
    osVersion: '14',
    deviceModel: 'Pixel 10 Pro',
  };

  context = async () => this.deviceContext;
}
