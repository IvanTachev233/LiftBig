import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { IonTabs } from '@ionic/angular';

import { ActiveWorkoutService } from '../../core/active-workout.service';
import { AthleteTabsPage } from './athlete-tabs.page';
import { CoachTabsPage } from './coach-tabs.page';

describe('Tab pages', () => {
  function tabs(page: Type<unknown>) {
    TestBed.configureTestingModule({
      imports: [page],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(page);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return Array.from(el.querySelectorAll('ion-tab-bar ion-tab-button')).map((b) => ({
      tab: b.getAttribute('tab'),
      icon: b.querySelector('ion-icon')?.getAttribute('name'),
      label: b.textContent?.trim(),
    }));
  }

  it('gives an athlete Today, Programs, History and Profile', () => {
    expect(tabs(AthleteTabsPage)).toEqual([
      { tab: 'today', icon: 'calendar-outline', label: 'Today' },
      { tab: 'programs', icon: 'layers-outline', label: 'Programs' },
      { tab: 'history', icon: 'time-outline', label: 'History' },
      { tab: 'profile', icon: 'person-outline', label: 'Profile' },
    ]);
  });

  it('gives a coach Clients and Profile only', () => {
    expect(tabs(CoachTabsPage)).toEqual([
      { tab: 'clients', icon: 'people-outline', label: 'Clients' },
      { tab: 'profile', icon: 'person-outline', label: 'Profile' },
    ]);
  });

  describe('resume bar', () => {
    function create(page: Type<unknown>) {
      TestBed.configureTestingModule({
        imports: [page],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      const refresh = spyOn(TestBed.inject(ActiveWorkoutService), 'refresh');
      const fixture = TestBed.createComponent(page);
      fixture.detectChanges();
      return { fixture, refresh };
    }

    it('sits above the athlete tab bar', () => {
      const { fixture } = create(AthleteTabsPage);
      const el: HTMLElement = fixture.nativeElement;
      const bar = el.querySelector('app-resume-bar')!;
      expect(bar).toBeTruthy();
      // ion-tabs renders unslotted children inside the page area, under the pages
      expect(bar.getAttribute('slot')).toBe('bottom');
      expect(bar.compareDocumentPosition(el.querySelector('ion-tab-bar')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('is refreshed when the athlete tabs are entered and on every tab change', () => {
      const { fixture, refresh } = create(AthleteTabsPage);
      const page = fixture.componentInstance as AthleteTabsPage;
      refresh.calls.reset();

      page.ionViewWillEnter();
      expect(refresh).toHaveBeenCalledTimes(1);

      const tabs = fixture.debugElement.query(By.directive(IonTabs)).componentInstance as IonTabs;
      tabs.ionTabsWillChange.emit({ tab: 'history' });
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('is not on the coach tabs', () => {
      const { fixture, refresh } = create(CoachTabsPage);
      expect(fixture.nativeElement.querySelector('app-resume-bar')).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
