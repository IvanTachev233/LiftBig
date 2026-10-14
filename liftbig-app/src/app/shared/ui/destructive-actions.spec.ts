import { Component, TemplateRef, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { of, throwError } from 'rxjs';
import { ConfirmSheetComponent, ConfirmSheetService } from './confirm-sheet.component';
import { SwipeDeleteRowComponent } from './swipe-delete-row.component';
import { SoftDelete, UNDO_MS, UndoToastService } from './undo-toast.service';
import { needsDeleteConfirm, prWarning } from './workout-status';

describe('SwipeDeleteRowComponent', () => {
  @Component({
    imports: [SwipeDeleteRowComponent, IonicModule],
    template: `
      <app-swipe-delete-row [label]="'Delete Leg Day'" [disabled]="locked" (delete)="deleted = deleted + 1">
        <ion-item><span class="row-text">Leg Day</span></ion-item>
      </app-swipe-delete-row>
    `,
  })
  class HostComponent {
    locked = false;
    deleted = 0;
  }

  let fixture: ComponentFixture<HostComponent>;
  const el = (s: string) => fixture.nativeElement.querySelector(s) as HTMLElement | null;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('wraps the row in a sliding item with one inset, expandable Delete option', () => {
    expect(el('ion-item-sliding ion-item .row-text')).toBeTruthy();
    const options = fixture.nativeElement.querySelectorAll('ion-item-option');
    expect(options.length).toBe(1);
    const option = options[0] as HTMLIonItemOptionElement;
    expect(option.classList).toContain('swipe-delete');
    expect(option.expandable).toBeTrue();
    expect(option.getAttribute('aria-label')).toBe('Delete Leg Day');
    expect(option.querySelector('ion-icon')!.getAttribute('name')).toBe('trash-outline');
    expect(option.textContent!.trim()).toBe('Delete');
    expect(el('ion-item-options')!.getAttribute('side')).toBe('end');
  });

  it('tapping Delete or a full swipe emits delete', async () => {
    el('ion-item-option')!.click();
    await fixture.whenStable();
    el('ion-item-options')!.dispatchEvent(new CustomEvent('ionSwipe', { detail: { side: 'end' } }));
    await fixture.whenStable();
    expect(fixture.componentInstance.deleted).toBe(2);
  });

  it('a locked row has no option and does not slide', () => {
    fixture.componentInstance.locked = true;
    fixture.detectChanges();
    expect(el('ion-item-option')).toBeNull();
    expect((el('ion-item-sliding') as HTMLIonItemSlidingElement).disabled).toBeTrue();
  });
});

describe('ConfirmSheetService', () => {
  @Component({
    template: `<ng-template #row let-w><span class="summary-row">{{ w.name }}</span></ng-template>`,
  })
  class RowHostComponent {
    @ViewChild('row', { static: true }) row!: TemplateRef<unknown>;
  }

  it('opens the sheet as a bottom sheet named by its title and resolves true only for the danger button', async () => {
    const modal = jasmine.createSpyObj<HTMLIonModalElement>('modal', ['present', 'onDidDismiss']);
    modal.present.and.resolveTo();
    const modals = jasmine.createSpyObj<ModalController>('ModalController', ['create']);
    modals.create.and.resolveTo(modal);
    TestBed.configureTestingModule({ providers: [{ provide: ModalController, useValue: modals }] });
    const service = TestBed.inject(ConfirmSheetService);
    const options = { title: 'Delete this workout?', message: 'Gone.', confirmLabel: 'Delete workout' };

    modal.onDidDismiss.and.resolveTo({ data: true, role: 'confirm' });
    expect(await service.confirm(options)).toBeTrue();
    expect(modals.create).toHaveBeenCalledWith(
      jasmine.objectContaining({
        component: ConfirmSheetComponent,
        componentProps: options,
        breakpoints: [0, 1],
        initialBreakpoint: 1,
        handle: true,
        htmlAttributes: { 'aria-label': 'Delete this workout?' },
      }),
    );

    for (const role of ['cancel', 'backdrop', 'gesture', undefined]) {
      modal.onDidDismiss.and.resolveTo({ role });
      expect(await service.confirm(options)).withContext(String(role)).toBeFalse();
    }
  });

  describe('sheet', () => {
    let fixture: ComponentFixture<ConfirmSheetComponent>;
    let modals: jasmine.SpyObj<ModalController>;
    const el = (s: string) => fixture.nativeElement.querySelector(s) as HTMLElement | null;

    beforeEach(() => {
      modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
      modals.dismiss.and.resolveTo(true);
      TestBed.overrideComponent(ConfirmSheetComponent, {
        add: { providers: [{ provide: ModalController, useValue: modals }] },
      });
      fixture = TestBed.createComponent(ConfirmSheetComponent);
      const host = TestBed.createComponent(RowHostComponent);
      Object.assign(fixture.componentInstance, {
        title: 'Delete this workout?',
        message: 'Its sets will be removed from your history and lift records.',
        confirmLabel: 'Delete workout',
        summary: host.componentInstance.row,
        summaryContext: { name: 'New Workout' },
        warning: 'Includes your Bench Press PR · 123 kg',
      });
      fixture.detectChanges();
    });

    it('shows the icon, title, consequence, the item row and the PR warning', () => {
      expect((el('.danger-circle ion-icon') as HTMLIonIconElement).name).toBe('trash-outline');
      expect(el('.confirm-title')!.textContent!.trim()).toBe('Delete this workout?');
      expect(el('.confirm-message')!.textContent!.trim()).toBe(
        'Its sets will be removed from your history and lift records.',
      );
      expect(el('.confirm-summary .summary-row')!.textContent).toBe('New Workout');
      expect(el('.confirm-warning')!.textContent!.trim()).toBe('Includes your Bench Press PR · 123 kg');
      expect(fixture.nativeElement.querySelector('ion-alert')).toBeNull();
    });

    it('stacks the danger button over Cancel', () => {
      const buttons = Array.from(fixture.nativeElement.querySelectorAll('.confirm-actions button')) as HTMLElement[];
      expect(buttons.map((b) => [b.className, b.textContent!.trim()])).toEqual([
        ['confirm-btn', 'Delete workout'],
        ['cancel-btn', 'Cancel'],
      ]);
      buttons[0].click();
      expect(modals.dismiss).toHaveBeenCalledWith(true, 'confirm');
      buttons[1].click();
      expect(modals.dismiss).toHaveBeenCalledWith(false, 'cancel');
    });

    it('leaves out the summary box without a summary or warning', () => {
      Object.assign(fixture.componentInstance, { summary: undefined, warning: undefined });
      fixture.detectChanges();
      expect(el('.confirm-summary')).toBeNull();
    });
  });
});

describe('UndoToastService', () => {
  let toasts: jasmine.SpyObj<ToastController>;
  let toast: jasmine.SpyObj<HTMLIonToastElement>;
  let end: (role: string) => void;
  let job: jasmine.SpyObj<SoftDelete> & SoftDelete;
  let commit: jasmine.Spy;

  // Each toast ends on its own; `end` ends the newest one
  function newToast() {
    let finish!: (v: { role: string }) => void;
    const dismissed = new Promise<{ role: string }>((r) => (finish = r));
    const t = jasmine.createSpyObj<HTMLIonToastElement>('toast', ['present', 'onDidDismiss', 'dismiss']);
    t.present.and.resolveTo();
    t.onDidDismiss.and.returnValue(dismissed as any);
    t.dismiss.and.callFake(async (_d?: unknown, role?: string) => {
      finish({ role: role ?? 'timeout' });
      return true;
    });
    end = (role) => finish({ role });
    return t;
  }

  beforeEach(() => {
    toast = newToast();
    toasts = jasmine.createSpyObj<ToastController>('ToastController', ['create']);
    toasts.create.and.resolveTo(toast);
    TestBed.configureTestingModule({ providers: [{ provide: ToastController, useValue: toasts }] });
    commit = jasmine.createSpy('commit').and.returnValue(of(null));
    job = {
      title: 'Workout deleted',
      sub: 'New Workout · Sat 10 Oct',
      hide: jasmine.createSpy('hide'),
      restore: jasmine.createSpy('restore'),
      commit,
      done: jasmine.createSpy('done'),
      failed: "Couldn't delete the workout",
    } as any;
  });

  const presented = () => new Promise<void>((r) => toast.present.and.callFake(async () => r()));

  it('hides first, shows a 5 s toast with Undo, and deletes only when it runs out', async () => {
    const shown = presented();
    const result = TestBed.inject(UndoToastService).softDelete(job);
    await shown;
    expect(job.hide).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(toasts.create).toHaveBeenCalledWith(
      jasmine.objectContaining({
        header: 'Workout deleted',
        message: 'New Workout · Sat 10 Oct',
        icon: 'trash-outline',
        duration: UNDO_MS,
        position: 'bottom',
        cssClass: 'undo-toast',
        buttons: [{ text: 'Undo', role: 'cancel' }],
      }),
    );
    expect(UNDO_MS).toBe(5000);

    end('timeout');
    expect(await result).toBe('deleted');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(job.done).toHaveBeenCalled();
    expect(job.restore).not.toHaveBeenCalled();
  });

  it('Undo restores and sends nothing', async () => {
    const shown = presented();
    const result = TestBed.inject(UndoToastService).softDelete(job);
    await shown;
    end('cancel');
    expect(await result).toBe('undone');
    expect(job.restore).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('a failed delete restores and shows the error', async () => {
    commit.and.returnValue(throwError(() => new Error('500')));
    const error = jasmine.createSpyObj<HTMLIonToastElement>('error', ['present']);
    error.present.and.resolveTo();
    toasts.create.and.returnValues(Promise.resolve(toast), Promise.resolve(error));
    const shown = presented();
    const result = TestBed.inject(UndoToastService).softDelete(job);
    await shown;
    end('timeout');
    expect(await result).toBe('failed');
    expect(job.restore).toHaveBeenCalled();
    expect(toasts.create.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ message: "Couldn't delete the workout", color: 'danger' }),
    );
  });

  it('a second delete sends the pending one at once', async () => {
    const service = TestBed.inject(UndoToastService);
    const shown = presented();
    const first = service.softDelete(job);
    await shown;

    const second = newToast();
    toasts.create.and.resolveTo(second);
    const secondShown = new Promise<void>((r) => second.present.and.callFake(async () => r()));
    const other = { ...job, commit: jasmine.createSpy('commit2').and.returnValue(of(null)) };
    const next = service.softDelete(other);
    expect(await first).toBe('deleted');
    expect(commit).toHaveBeenCalledTimes(1);
    await secondShown;
    expect(other.commit).not.toHaveBeenCalled();
    end('cancel');
    expect(await next).toBe('undone');
  });

  it('anchors above the resume bar, else the tab bar', async () => {
    const tabBar = document.createElement('ion-tab-bar');
    tabBar.style.cssText = 'display:block;height:50px';
    document.body.appendChild(tabBar);
    try {
      const shown = presented();
      const result = TestBed.inject(UndoToastService).softDelete(job);
      await shown;
      expect(toasts.create.calls.mostRecent().args[0]!.positionAnchor).toBe(tabBar);
      end('cancel');
      await result;
    } finally {
      tabBar.remove();
    }
  });
});

describe('delete rules', () => {
  const set = (made: boolean | null, extra = {}) =>
    ({ id: 's', reps: 1, weight: 100, order: 1, made, actualReps: null, actualWeight: null, notes: null, ...extra }) as any;
  const card = (name: string, sets: any[]) =>
    ({ id: name, exerciseId: name, exercise: { id: name, name }, order: 1, supersetGroup: null, sets }) as any;

  it('confirms completed workouts and ones with a logged set only', () => {
    expect(needsDeleteConfirm({ status: 'COMPLETED', exercises: [] })).toBeTrue();
    expect(needsDeleteConfirm({ status: 'IN_PROGRESS', exercises: [card('a', [set(false)])] })).toBeTrue();
    expect(needsDeleteConfirm({ status: 'PLANNED', exercises: [card('a', [set(true)])] })).toBeTrue();
    expect(needsDeleteConfirm({ status: 'PLANNED', exercises: [card('a', [set(null)])] })).toBeFalse();
    expect(needsDeleteConfirm({ status: 'IN_PROGRESS', exercises: [] })).toBeFalse();
  });

  it('names the first PR set with its logged weight', () => {
    const kg = (v: number) => `${v} kg`;
    expect(prWarning({ exercises: [card('Squat', [set(true)])] }, kg)).toBeUndefined();
    expect(prWarning({ exercises: [card('Bench Press', [set(true, { pb: true, actualWeight: 123 })])] }, kg)).toBe(
      'Includes your Bench Press PR · 123 kg',
    );
    expect(
      prWarning({ exercises: [card('Squat', [set(true, { pb: true })]), card('Bench', [set(true, { pb: true })])] }, kg),
    ).toBe('Includes your Squat PR · 100 kg, and 1 more');
  });
});
