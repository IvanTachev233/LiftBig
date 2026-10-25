import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { WeightUnitService } from '../../../core/weight-unit.service';
import { ManualEntrySheetComponent } from './manual-entry-sheet.component';

describe('ManualEntrySheetComponent', () => {
  let fixture: ComponentFixture<ManualEntrySheetComponent>;
  let component: ManualEntrySheetComponent;
  let modalCtrl: jasmine.SpyObj<ModalController>;

  beforeEach(() => {
    modalCtrl = jasmine.createSpyObj('ModalController', ['dismiss']);
    TestBed.configureTestingModule({ imports: [ManualEntrySheetComponent] });
    TestBed.overrideComponent(ManualEntrySheetComponent, {
      add: { providers: [{ provide: ModalController, useValue: modalCtrl }] },
    });
    fixture = TestBed.createComponent(ManualEntrySheetComponent);
    component = fixture.componentInstance;
    component.entry = { reps: 1, weight: null, achievedOn: '' };
    component.today = '2026-10-10';
    fixture.detectChanges();
  });

  const primary = () => fixture.nativeElement.querySelector('app-bottom-sheet ion-button.btn-primary') as HTMLIonButtonElement;

  it('starts on today and needs a weight above 0 and a day no later than today', () => {
    expect(component.achievedOn).toBe('2026-10-10');
    expect(primary().disabled).toBeTrue();

    component.weight = 0;
    fixture.detectChanges();
    expect(primary().disabled).toBeTrue();

    component.weight = 100;
    fixture.detectChanges();
    expect(primary().disabled).toBeFalse();

    component.achievedOn = '2026-10-11';
    fixture.detectChanges();
    expect(primary().disabled).toBeTrue();
  });

  it('labels the weight with the user unit', () => {
    TestBed.inject(WeightUnitService).setUnit('lb');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.entry-weight-input').label).toBe('Weight (lb)');
  });

  it('confirms with the reps, weight and day as numbers', () => {
    component.reps = '3';
    component.weight = '102.5' as unknown as number;
    component.achievedOn = '2026-10-01';
    component.add();
    expect(modalCtrl.dismiss).toHaveBeenCalledOnceWith(
      { reps: 3, weight: 102.5, achievedOn: '2026-10-01' },
      'confirm',
    );
  });

  it('does not confirm while invalid', () => {
    component.add();
    expect(modalCtrl.dismiss).not.toHaveBeenCalled();
  });
});
