import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';
import { CardNoteSheetComponent } from './card-note-sheet.component';

describe('CardNoteSheetComponent', () => {
  let fixture: ComponentFixture<CardNoteSheetComponent>;
  let modals: jasmine.SpyObj<ModalController>;

  async function create(note: string) {
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    TestBed.configureTestingModule({ imports: [CardNoteSheetComponent] });
    // IonicModule gives the sheet layout its own ModalController
    for (const component of [CardNoteSheetComponent, BottomSheetComponent]) {
      TestBed.overrideComponent(component, {
        add: { providers: [{ provide: ModalController, useValue: modals }] },
      });
    }
    fixture = TestBed.createComponent(CardNoteSheetComponent);
    fixture.componentInstance.exerciseName = 'Back Squat';
    fixture.componentInstance.note = note;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const field = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
  const text = (selector: string) =>
    (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();
  const save = () =>
    (fixture.nativeElement.querySelector('ion-button.btn-primary') as HTMLElement).click();

  function type(value: string) {
    field().value = value;
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('shows the title, the card it is for and the current note in a labelled field', async () => {
    await create('Pause at the bottom');
    expect(text('.sheet-title')).toBe('Note for athlete');
    expect(text('.sheet-helper')).toBe('Shown under Back Squat in the athlete\'s workout.');
    expect(field().value).toBe('Pause at the bottom');
    const label = fixture.nativeElement.querySelector(`label[for="${field().id}"]`) as HTMLElement;
    expect(label.textContent!.trim()).toBe('Note');
  });

  it('saves the typed note, trimmed', async () => {
    await create('');
    type('  Stay tight off the floor ');
    save();
    expect(modals.dismiss).toHaveBeenCalledOnceWith('Stay tight off the floor', 'confirm');
  });

  it('saving an emptied field returns an empty note', async () => {
    await create('Old note');
    type('   ');
    save();
    expect(modals.dismiss).toHaveBeenCalledOnceWith('', 'confirm');
  });
});
