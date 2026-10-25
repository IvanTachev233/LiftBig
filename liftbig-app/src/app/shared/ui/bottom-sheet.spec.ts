import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { BottomSheetComponent } from './bottom-sheet.component';
import { BottomSheetService } from './bottom-sheet.service';

@Component({ template: '' })
class SheetBodyComponent {}

describe('BottomSheetService', () => {
  let modals: jasmine.SpyObj<ModalController>;
  let modal: jasmine.SpyObj<HTMLIonModalElement>;

  beforeEach(() => {
    modal = jasmine.createSpyObj<HTMLIonModalElement>('modal', ['present', 'onDidDismiss']);
    modal.present.and.resolveTo();
    modal.onDidDismiss.and.resolveTo({ data: 'ABC123', role: 'confirm' });
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['create']);
    modals.create.and.resolveTo(modal);
    TestBed.configureTestingModule({ providers: [{ provide: ModalController, useValue: modals }] });
  });

  it('presents the component as a content-height sheet with a grabber', async () => {
    const result = await TestBed.inject(BottomSheetService).open(SheetBodyComponent, {
      label: 'Invite a client',
      props: { email: 'a@b.c' },
    });

    expect(modals.create).toHaveBeenCalledOnceWith({
      component: SheetBodyComponent,
      componentProps: { email: 'a@b.c' },
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      handle: true,
      cssClass: 'bottom-sheet',
      // The dialog role sits in the modal's shadow DOM, which only inherits aria-label
      htmlAttributes: { 'aria-label': 'Invite a client' },
    });
    expect(modal.present).toHaveBeenCalled();
    expect(result).toEqual({ data: 'ABC123', role: 'confirm' });
  });
});

@Component({
  imports: [BottomSheetComponent],
  template: `
    <app-bottom-sheet
      title="Invite a client"
      helper="They join with the invite code."
      primaryLabel="Send invite"
      [primaryDisabled]="disabled"
      (primary)="sent = sent + 1"
    >
      <p class="body">Body</p>
    </app-bottom-sheet>
  `,
})
class HostComponent {
  disabled = false;
  sent = 0;
}

describe('BottomSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let modals: jasmine.SpyObj<ModalController>;

  beforeEach(() => {
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    TestBed.configureTestingModule({ imports: [HostComponent] });
    // IonicModule gives the component its own ModalController
    TestBed.overrideComponent(BottomSheetComponent, {
      add: { providers: [{ provide: ModalController, useValue: modals }] },
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const primary = () => el().querySelector<HTMLElement>('ion-button.btn-primary')!;

  it('shows the title, helper, body and one primary button', () => {
    expect(el().querySelector('h2.sheet-title')!.textContent!.trim()).toBe('Invite a client');
    expect(el().querySelector('.sheet-helper')!.textContent!.trim()).toBe('They join with the invite code.');
    expect(el().querySelector('.body')).not.toBeNull();
    expect(el().querySelectorAll('ion-button.btn-primary').length).toBe(1);
    expect(primary().textContent!.trim()).toBe('Send invite');
  });

  it('emits primary when the button is pressed', () => {
    primary().click();
    expect(fixture.componentInstance.sent).toBe(1);
  });

  it('disables the primary button', () => {
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    expect((primary() as HTMLIonButtonElement).disabled).toBeTrue();
  });

  it('closes with the cancel role from the ✕ button', () => {
    const close = el().querySelector<HTMLButtonElement>('button.sheet-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    close.click();
    expect(modals.dismiss).toHaveBeenCalledOnceWith(undefined, 'cancel');
  });
});
