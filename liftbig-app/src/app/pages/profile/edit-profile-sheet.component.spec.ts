import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';
import { EditProfileSheetComponent } from './edit-profile-sheet.component';

describe('EditProfileSheetComponent', () => {
  let fixture: ComponentFixture<EditProfileSheetComponent>;
  let modals: jasmine.SpyObj<ModalController>;

  function create(name: string) {
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    TestBed.configureTestingModule({ imports: [EditProfileSheetComponent] });
    for (const component of [EditProfileSheetComponent, BottomSheetComponent]) {
      TestBed.overrideComponent(component, {
        add: { providers: [{ provide: ModalController, useValue: modals }] },
      });
    }
    fixture = TestBed.createComponent(EditProfileSheetComponent);
    fixture.componentInstance.name = name;
    fixture.detectChanges();
  }

  const el = <T = HTMLElement>(selector: string) =>
    fixture.nativeElement.querySelector(selector) as T;
  const saveButton = () => el<HTMLIonButtonElement>('ion-button.btn-primary');
  const type = (value: string) => {
    fixture.componentInstance.name = value;
    fixture.detectChanges();
  };

  it('shows the title and the current name in a labelled field', async () => {
    create('Una');
    await fixture.whenStable();
    expect(el('.sheet-title').textContent!.trim()).toBe('Edit profile');
    const input = el<HTMLIonInputElement>('ion-input.name-input');
    expect(input.label).toBe('Name');
    expect(input.maxlength).toBe(100);
    expect(input.value).toBe('Una');
    expect(saveButton().textContent!.trim()).toBe('Save');
  });

  it('enables Save only for a changed, non-blank name', () => {
    create('Una');
    expect(saveButton().disabled).toBeTrue();
    type('   ');
    expect(saveButton().disabled).toBeTrue();
    type(' Una ');
    expect(saveButton().disabled).toBeTrue();
    type('Una Lifter');
    expect(saveButton().disabled).toBeFalse();
  });

  it('allows a first name when there was none', () => {
    create('');
    type('Una');
    expect(saveButton().disabled).toBeFalse();
  });

  it('saves the trimmed name', () => {
    create('Una');
    type('  Una Lifter ');
    saveButton().click();
    expect(modals.dismiss).toHaveBeenCalledOnceWith('Una Lifter', 'confirm');
  });

  it('does not save a blank name', () => {
    create('Una');
    type('  ');
    fixture.componentInstance.save();
    expect(modals.dismiss).not.toHaveBeenCalled();
  });
});
