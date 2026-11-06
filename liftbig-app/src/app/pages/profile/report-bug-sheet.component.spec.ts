import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';
import { BUG_REPORT_PLATFORM } from '../../core/bug-report.service';
import { FakeBugReportPlatform } from '../../core/bug-report.testing';
import { ReportBugSheetComponent } from './report-bug-sheet.component';

/** A plain-colour PNG of the given size, as a picked file would arrive */
async function canvasFile(width: number, height: number, name = 'shot.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff6600';
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}

/** A fake file-input change event; real file pickers can't be scripted */
function pickEvent(files: File[]): Event {
  return { target: { files, value: '' } } as unknown as Event;
}

describe('ReportBugSheetComponent', () => {
  let fixture: ComponentFixture<ReportBugSheetComponent>;
  let component: ReportBugSheetComponent;
  let modals: jasmine.SpyObj<ModalController>;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/bug-reports`;

  beforeEach(() => {
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    TestBed.configureTestingModule({
      imports: [ReportBugSheetComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BUG_REPORT_PLATFORM, useValue: new FakeBugReportPlatform() },
      ],
    });
    for (const c of [ReportBugSheetComponent, BottomSheetComponent]) {
      TestBed.overrideComponent(c, {
        add: { providers: [{ provide: ModalController, useValue: modals }] },
      });
    }
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReportBugSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const el = <T = HTMLElement>(selector: string) =>
    fixture.nativeElement.querySelector(selector) as T;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) =>
    Array.from<T>(fixture.nativeElement.querySelectorAll(selector));
  const sendButton = () => el<HTMLIonButtonElement>('ion-button.btn-primary');
  const fill = (description: string, steps = '') => {
    component.description = description;
    component.steps = steps;
    fixture.detectChanges();
  };

  it('shows the fields, the privacy line with a link to the policy, and a disabled Send', () => {
    expect(el('.sheet-title').textContent!.trim()).toBe('Report a bug');
    expect(el('#bug-description-field')).not.toBeNull();
    expect(el('#bug-steps-field')).not.toBeNull();
    const link = el<HTMLAnchorElement>('.privacy-line a');
    expect(link.textContent!.trim()).toBe('Privacy Policy');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.href).toContain('/privacy');
    expect(sendButton().disabled).toBeTrue();
  });

  it('disables Send under 10 trimmed characters and enables it from 10', () => {
    fill('   short  ');
    expect(sendButton().disabled).toBeTrue();
    fill('  exactly 10 chars after trim  '.trim().slice(0, 10));
    expect(sendButton().disabled).toBeFalse();
  });

  it('disables Send when steps are over 2000 characters', () => {
    fill('A valid bug description', 'x'.repeat(2001));
    expect(sendButton().disabled).toBeTrue();
  });

  describe('screenshots', () => {
    it('adds a picked image as a thumbnail and caps at three with remove buttons', fakeAsync(async () => {
      const files = await Promise.all([canvasFile(100, 50, 'a.png'), canvasFile(100, 50, 'b.png')]);
      await component.addScreenshots(pickEvent(files));
      fixture.detectChanges();
      expect(all('.screenshot-thumb').length).toBe(2);

      const more = await Promise.all([canvasFile(100, 50, 'c.png'), canvasFile(100, 50, 'd.png')]);
      await component.addScreenshots(pickEvent(more));
      fixture.detectChanges();
      expect(all('.screenshot-thumb').length).toBe(3);
      expect(component.screenshots.length).toBe(3);
    }));

    it('removes a thumbnail and revokes its object URL', fakeAsync(async () => {
      const revoke = spyOn(URL, 'revokeObjectURL');
      const [file] = await Promise.all([canvasFile(100, 50)]);
      await component.addScreenshots(pickEvent([file]));
      fixture.detectChanges();
      const url0 = component.screenshots[0].url;

      all<HTMLButtonElement>('.screenshot-remove')[0].click();
      fixture.detectChanges();

      expect(component.screenshots.length).toBe(0);
      expect(revoke).toHaveBeenCalledWith(url0);
    }));

    it("shows an error and skips an image that can't be read, without adding it", fakeAsync(async () => {
      const broken = new File(['not an image'], 'broken.png', { type: 'image/png' });
      await component.addScreenshots(pickEvent([broken]));
      fixture.detectChanges();
      expect(component.screenshots.length).toBe(0);
      expect(el('.image-error').textContent!.trim()).toBe("Couldn't add that image");
    }));

    it('never exceeds three screenshots when two picks overlap', fakeAsync(async () => {
      const batchA = await Promise.all([canvasFile(100, 50, 'a1.png'), canvasFile(100, 50, 'a2.png')]);
      const batchB = await Promise.all([canvasFile(100, 50, 'b1.png'), canvasFile(100, 50, 'b2.png')]);

      // Both picks start before either finishes re-encoding (the real-world
      // race: a second file-input change event while the first is still
      // decoding the previous files)
      const pickA = component.addScreenshots(pickEvent(batchA));
      const pickB = component.addScreenshots(pickEvent(batchB));
      await Promise.all([pickA, pickB]);
      fixture.detectChanges();

      expect(component.screenshots.length).toBe(3);
      expect(all('.screenshot-thumb').length).toBe(3);
    }));

    it('hides the add control while a pick is being re-encoded', fakeAsync(async () => {
      const [file] = await Promise.all([canvasFile(100, 50)]);
      const pick = component.addScreenshots(pickEvent([file]));
      fixture.detectChanges();
      expect(component.adding).toBeTrue();
      expect(el('.screenshot-add')).toBeNull();

      await pick;
      fixture.detectChanges();

      expect(component.adding).toBeFalse();
      expect(el('.screenshot-add')).not.toBeNull();
    }));

    it('clears the file input only after every picked file is read', fakeAsync(async () => {
      // On Android's WebView, clearing the input released the picked files,
      // so the 2nd file of a multi-pick couldn't be read (B9 emulator smoke)
      const files = await Promise.all([canvasFile(100, 50, 'a.png'), canvasFile(100, 50, 'b.png')]);
      const target = { files, value: 'C:\\fakepath\\a.png' };
      const pick = component.addScreenshots({ target } as unknown as Event);
      expect(target.value).toBe('C:\\fakepath\\a.png');

      await pick;

      expect(component.screenshots.length).toBe(2);
      expect(target.value).toBe('');
    }));
  });

  describe('send', () => {
    it('posts the report and closes with confirm on success', fakeAsync(() => {
      fill('A real bug description here');
      sendButton().click();
      fixture.detectChanges();
      expect(sendButton().querySelector('ion-spinner')).not.toBeNull();

      tick();
      const req = http.expectOne(url);
      expect((req.request.body as FormData).get('description')).toBe('A real bug description here');
      req.flush({ id: 'br1' });
      tick();

      expect(modals.dismiss).toHaveBeenCalledOnceWith(true, 'confirm');
    }));

    it('sends nothing twice while a send is in flight', fakeAsync(() => {
      fill('A real bug description here');
      component.send();
      component.send();
      tick();
      const requests = http.match(url);
      expect(requests.length).toBe(1);
      requests[0].flush({ id: 'br1' });
      tick();
    }));

    it('keeps the form and shows a general error on failure', fakeAsync(() => {
      fill('A real bug description here');
      component.send();
      tick();
      http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
      tick();
      fixture.detectChanges();

      expect(modals.dismiss).not.toHaveBeenCalled();
      expect(component.description).toBe('A real bug description here');
      expect(el('.sheet-error').textContent!.trim()).toBe("Couldn't send your report. Try again.");
      expect(sendButton().disabled).toBeFalse();
    }));

    it('shows the daily limit message on 429', fakeAsync(() => {
      fill('A real bug description here');
      component.send();
      tick();
      http.expectOne(url).flush({ retryAfterHours: 6 }, { status: 429, statusText: 'Too Many Requests' });
      tick();
      fixture.detectChanges();

      expect(el('.sheet-error').textContent!.trim()).toBe(
        "You've sent a lot of reports today. Try again tomorrow.",
      );
    }));

    it('shows the disabled message on 503', fakeAsync(() => {
      fill('A real bug description here');
      component.send();
      tick();
      http.expectOne(url).flush('', { status: 503, statusText: 'Service Unavailable' });
      tick();
      fixture.detectChanges();

      expect(el('.sheet-error').textContent!.trim()).toBe('Bug reports are turned off right now.');
    }));
  });

  it('revokes every thumbnail URL on destroy', fakeAsync(async () => {
    const revoke = spyOn(URL, 'revokeObjectURL');
    const files = await Promise.all([canvasFile(100, 50, 'a.png'), canvasFile(100, 50, 'b.png')]);
    await component.addScreenshots(pickEvent(files));
    fixture.detectChanges();

    fixture.destroy();

    expect(revoke).toHaveBeenCalledTimes(2);
  }));
});
