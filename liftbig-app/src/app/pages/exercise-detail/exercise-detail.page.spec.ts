import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { ExerciseHistoryComponent } from '../../shared/components/exercise-history/exercise-history.component';
import { ExerciseDetailPage } from './exercise-detail.page';

describe('ExerciseDetailPage', () => {
  let fixture: ComponentFixture<ExerciseDetailPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExerciseDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ exerciseId: 'bench' }) } } },
        { provide: BottomSheetService, useValue: jasmine.createSpyObj('BottomSheetService', ['open']) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ExerciseDetailPage);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/lifts/bench/history`).flush({
      exerciseId: 'bench',
      best: null,
      latest: [],
      entries: [],
    });
  });

  afterEach(() => http.verify());

  const history = () =>
    fixture.debugElement.query((de) => de.componentInstance instanceof ExerciseHistoryComponent)
      .componentInstance as ExerciseHistoryComponent;

  it("titles the page with the exercise's name and shows its history", () => {
    http
      .expectOne(`${environment.apiUrl}/workouts/exercises`)
      .flush([{ id: 'squat', name: 'Back Squat' }, { id: 'bench', name: 'Bench Press' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-title').textContent.trim()).toBe('Bench Press');
    expect(history().exerciseId).toBe('bench');
  });

  it('goes back to History by default', () => {
    http.expectOne(`${environment.apiUrl}/workouts/exercises`).flush([]);
    expect(fixture.nativeElement.querySelector('ion-back-button').defaultHref).toBe('/history');
  });

  it('"+" opens the add entry sheet', () => {
    http.expectOne(`${environment.apiUrl}/workouts/exercises`).flush([]);
    fixture.detectChanges();
    const add = spyOn(history(), 'openAddEntry').and.resolveTo();
    fixture.nativeElement.querySelector('.add-entry-btn').click();
    expect(add).toHaveBeenCalled();
  });
});
