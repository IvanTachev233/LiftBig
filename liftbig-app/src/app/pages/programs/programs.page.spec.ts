import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Enrollment, ProgramSummary, Sport } from '../../core/program.service';
import { Workout, WorkoutStatus } from '../../core/workout.service';
import { ProgramsPage } from './programs.page';

describe('ProgramsPage', () => {
  let fixture: ComponentFixture<ProgramsPage>;
  let component: ProgramsPage;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  const sport = (id: string, name: string): Sport => ({
    id,
    name,
    displayOrder: 0,
    requiredLifts: [],
  });
  const weightlifting = sport('s1', 'Olympic Weightlifting');
  const powerlifting = sport('s2', 'Powerlifting');
  const program = (id: string, name: string): ProgramSummary => ({
    id,
    name,
    description: `About ${name}`,
    authorName: 'LiftBig',
    durationWeeks: 4,
    sessionsPerWeek: 3,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProgramsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProgramsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function enter(
    sports: Sport[] | 'error',
    firstPrograms: ProgramSummary[] = [],
    active: Partial<Enrollment> | null = null,
  ) {
    component.ionViewWillEnter();
    http.expectOne(`${api}/program-enrollments/active`).flush({ active });
    const req = http.expectOne(`${api}/sports`);
    if (sports === 'error') {
      req.flush('', { status: 500, statusText: 'Error' });
    } else {
      req.flush(sports);
      if (sports.length) {
        http.expectOne(`${api}/sports/${sports[0].id}/programs`).flush(firstPrograms);
      }
    }
    fixture.detectChanges();
  }

  const tabs = () =>
    Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.sport-chips .chip'),
    ).map((b) => b.textContent!.trim());
  const programNames = () =>
    Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.program-name'),
    ).map((n) => n.textContent!.trim());
  const text = () => (fixture.nativeElement as HTMLElement).textContent!;

  it('shows one tab per sport', () => {
    enter([weightlifting, powerlifting]);
    expect(tabs()).toEqual(['Olympic Weightlifting', 'Powerlifting']);
    // The sport chips are pinned with the compact bar
    expect(fixture.nativeElement.querySelector('app-tab-header .sport-chips')).toBeTruthy();
  });

  it('shows a third sport from the API as a third tab', () => {
    enter([weightlifting, powerlifting, sport('s3', 'Strongman')]);
    expect(tabs()).toEqual(['Olympic Weightlifting', 'Powerlifting', 'Strongman']);
  });

  it('lists the programs of the first sport with author, weeks and sessions', () => {
    enter([weightlifting, powerlifting], [program('p1', 'Sample Weightlifting Program')]);
    expect(programNames()).toEqual(['Sample Weightlifting Program']);
    expect(text()).toContain('About Sample Weightlifting Program');
    expect(text()).toContain('LiftBig');
    expect(text()).toContain('4 weeks');
    expect(text()).toContain('3 × week');
    expect(text()).toContain('12 sessions');
  });

  it("loads a sport's programs when its tab is chosen", () => {
    enter([weightlifting, powerlifting], [program('p1', 'Weightlifting A')]);
    (fixture.nativeElement.querySelectorAll('.sport-chips .chip')[1] as HTMLElement).click();
    http
      .expectOne(`${api}/sports/s2/programs`)
      .flush([program('p2', 'Powerlifting A'), program('p3', 'Powerlifting B')]);
    fixture.detectChanges();
    expect(programNames()).toEqual(['Powerlifting A', 'Powerlifting B']);
  });

  it('shows an empty state for a sport without programs', () => {
    enter([weightlifting], []);
    expect(fixture.nativeElement.querySelector('.programs-empty')).toBeTruthy();
  });

  it('shows an error state when the sports fail to load, with a retry', () => {
    enter('error');
    expect(fixture.nativeElement.querySelector('.programs-error')).toBeTruthy();
    expect(tabs()).toEqual([]);
  });

  it('shows an error state when the programs fail to load', () => {
    component.ionViewWillEnter();
    http.expectOne(`${api}/program-enrollments/active`).flush({ active: null });
    http.expectOne(`${api}/sports`).flush([weightlifting]);
    http
      .expectOne(`${api}/sports/s1/programs`)
      .flush('', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.programs-error')).toBeTruthy();
  });

  it('links each program to its detail page', () => {
    enter([weightlifting], [program('p1', 'Sample')]);
    const link = fixture.debugElement
      .query(By.css('.program-item'))
      .injector.get(RouterLink);
    expect(link.urlTree?.toString()).toBe('/programs/p1');
  });

  describe('active program card', () => {
    // Saturday 10 Oct 2026
    const NOW = new Date(2026, 9, 10, 12, 0);

    const session = (id: string, day: string, status: WorkoutStatus): Workout => ({
      id,
      name: id,
      date: `${day}T00:00:00.000Z`,
      status,
      totalWeightLifted: 0,
      assignedById: null,
      assignedBy: null,
      exercises: [],
    });

    const enrollment = (workouts: Workout[]): Partial<Enrollment> => ({
      id: 'en1',
      status: 'ACTIVE',
      startDate: '2026-10-01',
      program: { id: 'p1', name: 'Sample Weightlifting Program', sportId: 's1', durationWeeks: 4, sessionsPerWeek: 3 },
      workouts,
    });

    beforeEach(() => (component.now = () => NOW));

    it('is hidden without an active enrollment', () => {
      enter([weightlifting], []);
      expect(fixture.nativeElement.querySelector('.active-card')).toBeNull();
    });

    it('shows the program, week and next session, one progress segment per session and links to My program', () => {
      enter([weightlifting], [], enrollment([
        session('a', '2026-10-01', 'COMPLETED'),
        session('b', '2026-10-03', 'COMPLETED'),
        session('c', '2026-10-06', 'PLANNED'),
        session('d', '2026-10-08', 'IN_PROGRESS'),
        session('e', '2026-10-12', 'PLANNED'),
        session('f', '2026-10-15', 'PLANNED'),
      ]));
      const card = fixture.nativeElement.querySelector('.active-card') as HTMLElement;
      expect(card.querySelector('.active-name')!.textContent!.trim()).toBe('Sample Weightlifting Program');
      // Day 10 of the program is in week 2; the next planned session after today is Monday
      expect(card.querySelector('.active-week')!.textContent!.trim()).toBe('Week 2 of 4 · next: Mon 12 Oct');
      const segments = Array.from(card.querySelectorAll('app-progress-bar .segment'));
      expect(segments.length).toBe(6);
      expect(segments.map((s) => s.classList.contains('filled'))).toEqual([true, true, false, false, false, false]);
      expect(card.querySelector('.active-count')!.textContent!.trim()).toBe('2 of 6 sessions');

      const link = fixture.debugElement.query(By.css('.active-card')).injector.get(RouterLink);
      expect(link.urlTree?.toString()).toBe('/programs/active');
    });

    it('says next: today for a session planned today and leaves next out when none is left', () => {
      enter([weightlifting], [], enrollment([session('a', '2026-10-10', 'PLANNED')]));
      expect(fixture.nativeElement.querySelector('.active-week').textContent.trim()).toBe('Week 2 of 4 · next: today');

      enter([weightlifting], [], enrollment([session('a', '2026-10-01', 'COMPLETED')]));
      expect(fixture.nativeElement.querySelector('.active-week').textContent.trim()).toBe('Week 2 of 4');
    });
  });
});
