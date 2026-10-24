import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActionSheetController,
  AlertController,
  LoadingController,
  ModalController,
  PopoverController,
  ToastController,
} from '@ionic/angular';
import { AppUpdate, AppUpdateService, PLAY_STORE_URL } from '../../../core/app-update.service';
import { AppUpdateScreenComponent } from './app-update-screen.component';

/** A presented Ionic overlay; one that refuses to close answers dismiss() with false */
interface FakeOverlay {
  tag: string;
  open: boolean;
  role?: string;
  dismiss: jasmine.Spy;
}

describe('AppUpdateScreenComponent', () => {
  let fixture: ComponentFixture<AppUpdateScreenComponent>;
  let state: ReturnType<typeof signal<AppUpdate>>;
  let dismiss: jasmine.Spy;
  let overlays: FakeOverlay[];

  const open = (tag: string, closes = true): FakeOverlay => {
    const overlay: FakeOverlay = {
      tag,
      open: true,
      dismiss: jasmine.createSpy('dismiss').and.callFake(async (_data: unknown, role?: string) => {
        if (!closes) return false;
        overlay.open = false;
        overlay.role = role;
        return true;
      }),
    };
    overlays.push(overlay);
    return overlay;
  };
  // getTop(): the last presented overlay of that controller's tag
  const controller = (tag: string) => ({
    getTop: async () => overlays.filter((o) => o.tag === tag && o.open).slice(-1)[0],
  });

  beforeEach(() => {
    state = signal<AppUpdate>('none');
    dismiss = jasmine.createSpy('dismiss').and.callFake(() => state.set('none'));
    overlays = [];
    TestBed.configureTestingModule({
      imports: [AppUpdateScreenComponent],
      providers: [{ provide: AppUpdateService, useValue: { state, dismiss } }],
    });
    // Overridden rather than provided: the component's IonicModule provides
    // ModalController and PopoverController itself
    const fakes: [unknown, string][] = [
      [ModalController, 'ion-modal'],
      [AlertController, 'ion-alert'],
      [ActionSheetController, 'ion-action-sheet'],
      [PopoverController, 'ion-popover'],
      [LoadingController, 'ion-loading'],
      [ToastController, 'ion-toast'],
    ];
    for (const [token, tag] of fakes) TestBed.overrideProvider(token, { useValue: controller(tag) });
    fixture = TestBed.createComponent(AppUpdateScreenComponent);
  });

  const el = (): HTMLElement => fixture.nativeElement;
  const show = (value: AppUpdate) => {
    state.set(value);
    fixture.detectChanges();
  };
  const buttons = () => Array.from(el().querySelectorAll<HTMLIonButtonElement>('ion-button'));
  const presented = (eventName: string) => document.dispatchEvent(new CustomEvent(eventName, { bubbles: true }));

  it('shows nothing when no update is needed', () => {
    show('none');
    expect(el().querySelector('[role="dialog"]')).toBeNull();
  });

  it('blocks a build below the minimum: only the Play Store link, no way past it', () => {
    show('required');

    const dialog = el().querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(el().querySelector('h1')?.textContent).toContain('Update LiftBig');
    expect(el().textContent).toContain('no longer supported');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Update']);
    expect(buttons()[0].href).toBe(PLAY_STORE_URL);
  });

  it('offers the update below the latest, and Not now dismisses it', () => {
    show('available');

    expect(el().querySelector('h1')?.textContent).toContain('Update LiftBig');
    expect(el().textContent).toContain('A new version');
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Update', 'Not now']);
    expect(buttons()[0].href).toBe(PLAY_STORE_URL);

    buttons()[1].click();
    fixture.detectChanges();

    expect(dismiss).toHaveBeenCalled();
    expect(el().querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes every open dialog when the update becomes required', async () => {
    const opened = ['ion-modal', 'ion-modal', 'ion-alert', 'ion-action-sheet', 'ion-popover', 'ion-loading', 'ion-toast'].map(
      (tag) => open(tag),
    );

    show('required');
    await fixture.whenStable();

    expect(opened.filter((o) => o.open)).toEqual([]);
    expect(opened.map((o) => o.role)).toEqual(opened.map(() => 'app-update'));
  });

  it('leaves dialogs open for an update that can wait', async () => {
    const sheet = open('ion-modal');

    show('available');
    await fixture.whenStable();

    expect(sheet.open).toBeTrue();
    expect(sheet.dismiss).not.toHaveBeenCalled();
  });

  it('closes a dialog that opens while the update is required, and only then', async () => {
    show('none');
    const before = open('ion-alert');
    presented('ionAlertDidPresent');
    await fixture.whenStable();
    expect(before.open).toBeTrue();
    before.open = false;

    show('required');
    await fixture.whenStable();
    const alert = open('ion-alert');
    presented('ionAlertDidPresent');
    const toast = open('ion-toast');
    presented('ionToastDidPresent');
    await fixture.whenStable();

    expect(alert.open).toBeFalse();
    expect(toast.open).toBeFalse();
  });

  it('stops at a dialog that refuses to close', async () => {
    const stuck = open('ion-modal', false);
    const alert = open('ion-alert');

    show('required');
    await fixture.whenStable();

    expect(stuck.dismiss).toHaveBeenCalledTimes(1);
    expect(stuck.open).toBeTrue();
    expect(alert.open).toBeFalse();
  });
});
