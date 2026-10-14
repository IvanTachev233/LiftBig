import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { IonicModule } from '@ionic/angular';

/**
 * Header of a tab root screen: a compact 44px bar with the centred title and,
 * when the page has filters, a second toolbar pinned under it holding the
 * projected controls. The title fades in once the page's large title
 * (LargeTitleComponent) scrolls under the header: Ionic does this on iOS, the
 * is-collapsed class on md. The 1px border shows only while the content is
 * scrolled.
 */
@Component({
  selector: 'app-tab-header',
  template: `
    <ion-header
      class="tab-header ion-no-border"
      [class.is-scrolled]="scrolled()"
      [class.is-collapsed]="collapsed()"
    >
      <ion-toolbar class="tab-header-bar">
        <ion-title role="heading" aria-level="1">{{ title() }}</ion-title>
      </ion-toolbar>
      @if (filters()) {
        <ion-toolbar class="tab-header-filters">
          <ng-content />
        </ion-toolbar>
      }
    </ion-header>
  `,
  standalone: true,
  imports: [IonicModule],
  // The page lays out the ion-header as its own flex child
  host: { style: 'display: contents' },
})
export class TabHeaderComponent implements AfterViewInit {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  readonly title = input.required<string>();
  /** Shows the projected controls in a pinned toolbar */
  readonly filters = input(false);

  protected readonly scrolled = signal(false);
  protected readonly collapsed = signal(false);

  async ngAfterViewInit() {
    const page = this.host.nativeElement.closest('.ion-page');
    const content = page?.querySelector('ion-content') as HTMLIonContentElement | null | undefined;
    const scrollEl = await content?.getScrollElement?.().catch(() => null);
    if (!scrollEl) return;
    const header = this.host.nativeElement.querySelector('ion-header');
    const largeTitle = page?.querySelector('app-large-title ion-title');
    const update = () => {
      this.scrolled.set(scrollEl.scrollTop > 0);
      // Collapsed once the large title's text has passed under the header
      this.collapsed.set(
        !largeTitle ||
          !header ||
          largeTitle.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom,
      );
    };
    scrollEl.addEventListener('scroll', update, { passive: true });
    this.destroyRef.onDestroy(() => scrollEl.removeEventListener('scroll', update));
    update();
  }
}
