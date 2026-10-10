import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ProgramSummary, Sport } from '../../core/program.service';
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

  function enter(sports: Sport[] | 'error', firstPrograms: ProgramSummary[] = []) {
    component.ionViewWillEnter();
    http
      .expectOne(`${api}/program-enrollments/active`)
      .flush({ active: null });
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
      fixture.nativeElement.querySelectorAll('ion-segment-button'),
    ).map((b) => b.textContent!.trim());
  const programNames = () =>
    Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('.program-name'),
    ).map((n) => n.textContent!.trim());
  const text = () => (fixture.nativeElement as HTMLElement).textContent!;

  it('shows one tab per sport', () => {
    enter([weightlifting, powerlifting]);
    expect(tabs()).toEqual(['Olympic Weightlifting', 'Powerlifting']);
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
    expect(text()).toContain('3 sessions/week');
  });

  it("loads a sport's programs when its tab is chosen", () => {
    enter([weightlifting, powerlifting], [program('p1', 'Weightlifting A')]);
    component.selectSport('s2');
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
});
