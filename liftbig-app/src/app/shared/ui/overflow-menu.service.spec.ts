import { TestBed } from '@angular/core/testing';
import { ActionSheetController } from '@ionic/angular';
import { OverflowMenuService } from './overflow-menu.service';

describe('OverflowMenuService', () => {
  let sheets: jasmine.SpyObj<ActionSheetController>;
  let sheet: jasmine.SpyObj<HTMLIonActionSheetElement>;
  let service: OverflowMenuService;

  beforeEach(() => {
    sheet = jasmine.createSpyObj<HTMLIonActionSheetElement>('sheet', ['present', 'onDidDismiss']);
    sheet.present.and.resolveTo();
    sheets = jasmine.createSpyObj<ActionSheetController>('ActionSheetController', ['create']);
    sheets.create.and.resolveTo(sheet);
    TestBed.configureTestingModule({ providers: [{ provide: ActionSheetController, useValue: sheets }] });
    service = TestBed.inject(OverflowMenuService);
  });

  const actions = [
    { id: 'replace', text: 'Replace' },
    { id: 'history', text: 'History' },
    { id: 'remove', text: 'Remove', destructive: true },
  ];

  it('lists the actions, destructive ones styled as such, then Cancel', async () => {
    sheet.onDidDismiss.and.resolveTo({ data: { action: 'replace' }, role: undefined });
    await service.open(actions, 'Back Squat');

    const options = sheets.create.calls.mostRecent().args[0]!;
    expect(options.header).toBe('Back Squat');
    expect(options.cssClass).toBe('overflow-menu');
    expect(options.buttons).toEqual([
      { text: 'Replace', data: { action: 'replace' } },
      { text: 'History', data: { action: 'history' } },
      { text: 'Remove', role: 'destructive', data: { action: 'remove' } },
      { text: 'Cancel', role: 'cancel' },
    ]);
    expect(sheet.present).toHaveBeenCalled();
  });

  it('returns the chosen action', async () => {
    sheet.onDidDismiss.and.resolveTo({ data: { action: 'remove' }, role: 'destructive' });
    expect(await service.open(actions)).toBe('remove');
  });

  it('returns null when cancelled or dismissed from the backdrop', async () => {
    sheet.onDidDismiss.and.resolveTo({ data: undefined, role: 'cancel' });
    expect(await service.open(actions)).toBeNull();
    sheet.onDidDismiss.and.resolveTo({ data: undefined, role: 'backdrop' });
    expect(await service.open(actions)).toBeNull();
  });
});
