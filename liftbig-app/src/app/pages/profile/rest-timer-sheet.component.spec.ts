import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';
import { RestTimerSheetComponent } from './rest-timer-sheet.component';

describe('RestTimerSheetComponent', () => {
  let fixture: ComponentFixture<RestTimerSheetComponent>;
  let modals: jasmine.SpyObj<ModalController>;

  function create(seconds: number) {
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    TestBed.configureTestingModule({ imports: [RestTimerSheetComponent] });
    // IonicModule gives the sheet layout its own ModalController
    for (const component of [RestTimerSheetComponent, BottomSheetComponent]) {
      TestBed.overrideComponent(component, {
        add: { providers: [{ provide: ModalController, useValue: modals }] },
      });
    }
    fixture = TestBed.createComponent(RestTimerSheetComponent);
    fixture.componentInstance.seconds = seconds;
    fixture.detectChanges();
  }

  const chips = () =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="radio"]'));
  const checked = () =>
    chips()
      .filter((c) => c.getAttribute('aria-checked') === 'true')
      .map((c) => c.textContent!.trim());
  const save = () =>
    (fixture.nativeElement.querySelector('ion-button.btn-primary') as HTMLElement).click();

  it('lists Off and the preset times with the current one checked', () => {
    create(120);
    expect(chips().map((c) => c.textContent!.trim())).toEqual([
      'Off', '0:30', '0:45', '1:00', '1:30', '2:00', '2:30', '3:00', '4:00', '5:00',
    ]);
    expect(checked()).toEqual(['2:00']);
    expect(fixture.nativeElement.querySelector('[role="radiogroup"]').getAttribute('aria-label'))
      .toBe('Rest time');
  });

  it('adds a stored time that is not a preset, in order', () => {
    create(100);
    const labels = chips().map((c) => c.textContent!.trim());
    expect(labels.slice(4, 7)).toEqual(['1:30', '1:40', '2:00']);
    expect(checked()).toEqual(['1:40']);
  });

  it('saves the picked time in seconds', () => {
    create(120);
    chips()[0].click();
    fixture.detectChanges();
    expect(checked()).toEqual(['Off']);
    save();
    expect(modals.dismiss).toHaveBeenCalledOnceWith(0, 'confirm');
  });
});
