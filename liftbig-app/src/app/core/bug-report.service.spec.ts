import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { BUG_REPORT_PLATFORM, BugReportService } from './bug-report.service';
import { FakeBugReportPlatform } from './bug-report.testing';

describe('BugReportService', () => {
  let service: BugReportService;
  let http: HttpTestingController;
  let platform: FakeBugReportPlatform;
  const url = `${environment.apiUrl}/bug-reports`;

  beforeEach(() => {
    platform = new FakeBugReportPlatform();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BUG_REPORT_PLATFORM, useValue: platform },
      ],
    });
    service = TestBed.inject(BugReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the description, device context and screenshots as multipart form data, without role', fakeAsync(() => {
    const screenshot = new Blob(['x'], { type: 'image/jpeg' });
    let result: { id: string } | undefined;
    service
      .send({ description: 'It crashed on save', steps: 'Open the app and tap Save', screenshots: [screenshot] })
      .subscribe((r) => (result = r));
    tick();

    const req = http.expectOne(url);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get('description')).toBe('It crashed on save');
    expect(body.get('steps')).toBe('Open the app and tap Save');
    expect(body.get('appVersion')).toBe('1.2.3');
    expect(body.get('versionCode')).toBe('42');
    expect(body.get('platform')).toBe('android');
    expect(body.get('osVersion')).toBe('14');
    expect(body.get('deviceModel')).toBe('Pixel 10 Pro');
    expect(body.has('role')).toBeFalse();
    const files = body.getAll('screenshots') as File[];
    expect(files.length).toBe(1);
    expect(files[0].name).toBe('screenshot-1.jpg');

    req.flush({ id: 'br1' });
    tick();
    expect(result).toEqual({ id: 'br1' });
  }));

  it('omits steps and sends no files when there are none', fakeAsync(() => {
    service.send({ description: 'Bug', steps: '', screenshots: [] }).subscribe();
    tick();

    const req = http.expectOne(url);
    const body = req.request.body as FormData;
    expect(body.has('steps')).toBeFalse();
    expect(body.getAll('screenshots').length).toBe(0);
    req.flush({ id: 'br2' });
    tick();
  }));

  it('names up to three screenshots in order', fakeAsync(() => {
    const screenshots = [
      new Blob(['a'], { type: 'image/jpeg' }),
      new Blob(['b'], { type: 'image/jpeg' }),
      new Blob(['c'], { type: 'image/jpeg' }),
    ];
    service.send({ description: 'Bug', steps: '', screenshots }).subscribe();
    tick();

    const req = http.expectOne(url);
    const files = (req.request.body as FormData).getAll('screenshots') as File[];
    expect(files.map((f) => f.name)).toEqual(['screenshot-1.jpg', 'screenshot-2.jpg', 'screenshot-3.jpg']);
    req.flush({ id: 'br3' });
    tick();
  }));
});
