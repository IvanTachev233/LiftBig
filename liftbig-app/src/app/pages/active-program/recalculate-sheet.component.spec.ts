import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
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
});
