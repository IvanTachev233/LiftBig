import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { PluginListenerHandle } from '@capacitor/core';
import { environment } from '../../environments/environment';
import { APP_UPDATE_PLATFORM, AppUpdatePlatform, AppUpdateService } from './app-update.service';

/** The installed versionCode and resume events */
class FakePlatform implements AppUpdatePlatform {
  code: number | null = 5;
  resumeListener?: () => void;
  versionCode = async () => this.code;
  onResume = async (listener: () => void): Promise<PluginListenerHandle> => {
    this.resumeListener = listener;
    return { remove: () => Promise.resolve() };
  };
}

describe('AppUpdateService', () => {
  const url = `${environment.apiUrl}/app-config`;
  let platform: FakePlatform;
  let service: AppUpdateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    platform = new FakePlatform();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_UPDATE_PLATFORM, useValue: platform },
      ],
    });
    service = TestBed.inject(AppUpdateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Starts (or checks again) and answers the request with this config
  const answer = (config: object, run: () => void = () => void service.start()) => {
    run();
    flushMicrotasks();
    httpMock.expectOne(url).flush(config);
    flushMicrotasks();
  };
  const resume = () => platform.resumeListener!();

  it('blocks a build below the minimum, and it cannot be dismissed', fakeAsync(() => {
    answer({ minVersionCode: 6, latestVersionCode: 8 });

    expect(service.state()).toBe('required');
    service.dismiss();
    expect(service.state()).toBe('required');
  }));

  it('offers the update to a build below the latest, until dismissed', fakeAsync(() => {
    answer({ minVersionCode: 5, latestVersionCode: 6 });

    expect(service.state()).toBe('available');
    service.dismiss();
    expect(service.state()).toBe('none');
  }));

  it('shows nothing for the latest build or without a minimum and latest', fakeAsync(() => {
    answer({ minVersionCode: 3, latestVersionCode: 5 });
    expect(service.state()).toBe('none');

    answer({ minVersionCode: null, latestVersionCode: null }, resume);
    expect(service.state()).toBe('none');
  }));

  it('shows nothing when the API cannot be reached', fakeAsync(() => {
    void service.start();
    flushMicrotasks();
    httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0 });
    flushMicrotasks();

    expect(service.state()).toBe('none');
  }));

  it('shows nothing on a server error or an answer it cannot read', fakeAsync(() => {
    void service.start();
    flushMicrotasks();
    httpMock.expectOne(url).flush({}, { status: 503, statusText: 'Unavailable' });
    flushMicrotasks();
    expect(service.state()).toBe('none');

    answer({ minVersionCode: '9', latestVersionCode: 'soon' }, resume);
    expect(service.state()).toBe('none');
  }));

  it("doesn't ask where the build has no versionCode (web)", fakeAsync(() => {
    platform.code = null;
    void service.start();
    flushMicrotasks();

    httpMock.expectNone(url);
    expect(service.state()).toBe('none');
  }));

  it('checks again on resume', fakeAsync(() => {
    answer({ minVersionCode: null, latestVersionCode: null });
    expect(service.state()).toBe('none');

    answer({ minVersionCode: 6, latestVersionCode: 6 }, resume);
    expect(service.state()).toBe('required');
  }));

  it('keeps the screen when a check on resume fails', fakeAsync(() => {
    answer({ minVersionCode: 6, latestVersionCode: 6 });

    resume();
    flushMicrotasks();
    httpMock.expectOne(url).error(new ProgressEvent('error'), { status: 0 });
    flushMicrotasks();

    expect(service.state()).toBe('required');
  }));

  it('keeps a dismissed offer hidden on resume, and offers a newer build again', fakeAsync(() => {
    answer({ minVersionCode: null, latestVersionCode: 6 });
    service.dismiss();

    answer({ minVersionCode: null, latestVersionCode: 6 }, resume);
    expect(service.state()).toBe('none');

    answer({ minVersionCode: null, latestVersionCode: 7 }, resume);
    expect(service.state()).toBe('available');
  }));

  it('blocks on resume after an offer was dismissed once the minimum is raised', fakeAsync(() => {
    answer({ minVersionCode: null, latestVersionCode: 6 });
    service.dismiss();

    answer({ minVersionCode: 6, latestVersionCode: 6 }, resume);
    expect(service.state()).toBe('required');
  }));

  it('listens for resume once however often it is started', fakeAsync(() => {
    const onResume = spyOn(platform, 'onResume').and.callThrough();
    void service.start();
    void service.start();
    flushMicrotasks();

    httpMock.expectOne(url).flush({ minVersionCode: null, latestVersionCode: null });
    expect(onResume).toHaveBeenCalledTimes(1);
  }));
});
