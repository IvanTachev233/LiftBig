import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { defineCustomElements } from '@ionic/core/loader';
import { LargeTitleComponent } from './large-title.component';
import { TabHeaderComponent } from './tab-header.component';

/** A tab root page: header, then content holding the large title and a long list */
@Component({
  imports: [IonicModule, TabHeaderComponent, LargeTitleComponent],
  template: `
    <div class="ion-page">
      <app-tab-header title="History" [filters]="filters">
        <span class="filter-control">Workouts | Lifts</span>
      </app-tab-header>
      <ion-content>
        <app-large-title title="History">
          <span intro class="intro">Saturday</span>
        </app-large-title>
      </ion-content>
    </div>
  `,
})
class HostComponent {
  filters = true;
}

describe('TabHeaderComponent and LargeTitleComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  // ion-content isn't defined in unit tests; give it the one method the header uses
  let scrollEl: HTMLElement;
  function createWithScroller() {
    fixture = TestBed.createComponent(HostComponent);
    scrollEl = document.createElement('div');
    // Shadows Ionic's read-only method once the element is defined
    Object.defineProperty(el().querySelector('ion-content'), 'getScrollElement', {
      value: () => Promise.resolve(scrollEl),
      configurable: true,
    });
    fixture.detectChanges();
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  it('puts the compact title and the pinned filters in one regular ion-header', () => {
    createWithScroller();
    const header = el().querySelector('app-tab-header ion-header')!;
    expect(header.getAttribute('collapse')).toBeNull();
    const toolbars = header.querySelectorAll('ion-toolbar');
    expect(toolbars.length).toBe(2);
    expect(toolbars[0].querySelector('ion-title')!.textContent!.trim()).toBe('History');
    expect(toolbars[1].querySelector('.filter-control')).toBeTruthy();
  });

  it('leaves out the filter toolbar when the page has no filters', () => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.filters = false;
    fixture.detectChanges();
    expect(el().querySelectorAll('app-tab-header ion-toolbar').length).toBe(1);
  });

  it('puts the large title in a condense header inside the content, with the intro before it', () => {
    createWithScroller();
    const large = el().querySelector('ion-content app-large-title ion-header')!;
    expect(large.getAttribute('collapse')).toBe('condense');
    const title = large.querySelector('ion-title')!;
    expect(title.getAttribute('size')).toBe('large');
    expect(title.textContent!.trim()).toBe('History');
    expect(large.querySelector('.intro')!.textContent).toBe('Saturday');
  });

  it('names both titles as level-1 headings', () => {
    createWithScroller();
    for (const title of Array.from(el().querySelectorAll('ion-title'))) {
      expect(title.getAttribute('role')).toBe('heading');
      expect(title.getAttribute('aria-level')).toBe('1');
    }
  });

  it('marks the header scrolled once the content leaves the top, and not when it returns', async () => {
    createWithScroller();
    await fixture.whenStable();
    const header = () => el().querySelector('app-tab-header ion-header')!;
    expect(header().classList).not.toContain('is-scrolled');

    Object.defineProperty(scrollEl, 'scrollTop', { value: 120, configurable: true });
    scrollEl.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(header().classList).toContain('is-scrolled');

    Object.defineProperty(scrollEl, 'scrollTop', { value: 0, configurable: true });
    scrollEl.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(header().classList).not.toContain('is-scrolled');
  });

  it('marks the header collapsed once the large title has scrolled under the header', async () => {
    createWithScroller();
    const headerEl = el().querySelector('app-tab-header ion-header')!;
    const largeTitle = el().querySelector('app-large-title ion-title')!;
    spyOn(headerEl, 'getBoundingClientRect').and.returnValue({ bottom: 96 } as DOMRect);
    const titleRect = spyOn(largeTitle, 'getBoundingClientRect');
    titleRect.and.returnValue({ bottom: 130 } as DOMRect);
    await fixture.whenStable();
    fixture.detectChanges();
    const header = () => el().querySelector('app-tab-header ion-header')!;
    expect(header().classList).not.toContain('is-collapsed');

    titleRect.and.returnValue({ bottom: 90 } as DOMRect);
    scrollEl.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(header().classList).toContain('is-collapsed');

    titleRect.and.returnValue({ bottom: 130 } as DOMRect);
    scrollEl.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(header().classList).not.toContain('is-collapsed');
  });

  // Spec § LB-37: Ionic pads the first toolbar of every ion-header for the
  // status bar, the large title's header in the content included
  describe('with a status bar inset', () => {
    beforeEach(async () => {
      defineCustomElements(window);
      await Promise.all(['ion-header', 'ion-toolbar'].map((tag) => customElements.whenDefined(tag)));
      document.documentElement.style.setProperty('--ion-safe-area-top', '48px');
    });

    afterEach(() => document.documentElement.style.removeProperty('--ion-safe-area-top'));

    it('pads the tab header for the status bar once, and the large title not at all', async () => {
      fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const ionic = Array.from(el().querySelectorAll<HTMLIonHeaderElement | HTMLIonToolbarElement>('ion-header, ion-toolbar'));
      await Promise.all(ionic.map((e) => e.componentOnReady()));

      const tabBar = el().querySelector('app-tab-header ion-toolbar')!;
      const largeTitleBar = el().querySelector('app-large-title ion-toolbar')!;
      expect(getComputedStyle(tabBar).paddingTop).toBe('48px');
      expect(getComputedStyle(largeTitleBar).paddingTop).toBe('0px');
    });

    // Spec § LB-35 Week strip: Today's chip is taller than the date line it
    // sits on, so it reaches into the toolbar, which Ionic stacks at z-index 10
    it('keeps an intro action whole above the large title toolbar', async () => {
      const intro = TestBed.createComponent(IntroActionHostComponent);
      intro.detectChanges();
      const host = intro.nativeElement as HTMLElement;
      const ionic = Array.from(host.querySelectorAll<HTMLIonHeaderElement | HTMLIonToolbarElement>('ion-header, ion-toolbar'));
      await Promise.all(ionic.map((e) => e.componentOnReady()));

      const chip = host.querySelector<HTMLElement>('.intro-action')!;
      const box = chip.getBoundingClientRect();
      const x = box.left + box.width / 2;
      expect(document.elementFromPoint(x, box.top + 2)).toBe(chip);
      expect(document.elementFromPoint(x, box.bottom - 2)).toBe(chip);
    });
  });
});

/**
 * A large title with an action at the end of its intro line, as Today's "Today" chip.
 * Pinned near the top of the viewport, above any overlay an earlier spec left
 * open: hit-testing needs it on screen, and in flow it would sit below whatever
 * the test page holds, such as Karma's reporter, which grows with every
 * finished spec (Karma's frame is ~400px tall). 40px leaves room for the chip,
 * which reaches above the date line
 */
@Component({
  imports: [LargeTitleComponent],
  template: `
    <div style="position: fixed; top: 40px; left: 0; width: 390px; z-index: 2147483647">
      <app-large-title title="Good morning">
        <div intro class="intro-row">
          <span class="today-date">Friday, 6 November</span>
          <button type="button" class="chip intro-action">Today</button>
        </div>
      </app-large-title>
    </div>
  `,
})
class IntroActionHostComponent {}
