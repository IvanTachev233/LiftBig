import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
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
});
