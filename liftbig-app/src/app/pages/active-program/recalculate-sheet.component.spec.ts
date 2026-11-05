import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { WeightUnitService } from '../../core/weight-unit.service';
import { RecalculateSheetComponent } from './recalculate-sheet.component';

describe('RecalculateSheetComponent', () => {
  let fixture: ComponentFixture<RecalculateSheetComponent>;
  let component: RecalculateSheetComponent;
  let modalCtrl: jasmine.SpyObj<ModalController>;

  beforeEach(() => {
    modalCtrl = jasmine.createSpyObj('ModalController', ['dismiss']);
    TestBed.configureTestingModule({ imports: [RecalculateSheetComponent] });
    TestBed.overrideComponent(RecalculateSheetComponent, {
      add: { providers: [{ provide: ModalController, useValue: modalCtrl }] },
    });
    fixture = TestBed.createComponent(RecalculateSheetComponent);
    component = fixture.componentInstance;
    component.lifts = [
      { id: 'squat', label: 'Squat' },
      { id: 'bench', label: 'Bench Press' },
    ];
    component.maxes = { squat: 140, bench: null };
    fixture.detectChanges();
  });

  it('asks for each lift with its label, in order', () => {
    const labels = Array.from<HTMLIonInputElement>(fixture.nativeElement.querySelectorAll('ion-input.max-input')).map(
      (i) => i.label,
    );
    expect(labels).toEqual(['Squat', 'Bench Press']);
  });

  it('confirms only when every max is above 0', () => {
    component.confirm();
    expect(modalCtrl.dismiss).not.toHaveBeenCalled();

    component.maxes['bench'] = 100;
    component.confirm();
    expect(modalCtrl.dismiss).toHaveBeenCalledOnceWith({ squat: 140, bench: 100 }, 'confirm');
  });

  const errors = () =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.max-field')).map(
      (field) => field.querySelector('.field-error')?.textContent?.trim() ?? '',
    );

  it('says under a max why it is out of range and does not confirm', () => {
    expect(errors()).toEqual(['', '']);

    component.maxes = { squat: 10000, bench: 0.004 };
    fixture.detectChanges();
    expect(errors()).toEqual(['At most 9999.99 kg', 'At least 0.01 kg']);
    component.confirm();
    expect(modalCtrl.dismiss).not.toHaveBeenCalled();

    component.maxes = { squat: 9999.99, bench: 0.01 };
    fixture.detectChanges();
    expect(errors()).toEqual(['', '']);
    component.confirm();
    expect(modalCtrl.dismiss).toHaveBeenCalledOnceWith({ squat: 9999.99, bench: 0.01 }, 'confirm');
  });

  it('gives the limits in pounds for a pound user', () => {
    TestBed.inject(WeightUnitService).setUnit('lb');
    component.maxes = { squat: 22046.3, bench: 0.01 };
    fixture.detectChanges();
    expect(errors()).toEqual(['At most 22046.2 lb', 'At least 0.02 lb']);
  });
});
